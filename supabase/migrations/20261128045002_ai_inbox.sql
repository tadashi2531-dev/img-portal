-- 人が話した内容を AI が読む受付箱。ログイン済みだけが読み書きできる。
-- ここに入れても見積やメールは作られない。処理は Grok Bot が下書きとして各欄へ書く。

create table public.ai_inbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  text text not null,
  status text not null default '未処理',
  result_summary text not null default '',
  result_links jsonb not null default '[]'::jsonb,
  processed_at timestamptz,
  constraint ai_inbox_text_check check (btrim(text) <> ''),
  constraint ai_inbox_status_check check (status in ('未処理', '処理中', '処理済', '要確認')),
  constraint ai_inbox_links_check check (jsonb_typeof(result_links) = 'array')
);

comment on table public.ai_inbox is 'AIに話す。人が話した依頼の受付。Bot が各欄の下書きへ振り分ける';
comment on column public.ai_inbox.status is '未処理、処理中、処理済、要確認';
comment on column public.ai_inbox.result_links is '処理結果へのリンク。[{section, id, label}]';

create index ai_inbox_status_created_idx on public.ai_inbox (status, created_at desc);

alter table public.ai_inbox enable row level security;
alter table public.ai_inbox force row level security;

create policy ai_inbox_authenticated_all
  on public.ai_inbox
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.ai_inbox from anon, public;
grant select, insert, update, delete on table public.ai_inbox to authenticated;

create or replace function public.list_ai_inbox_pending()
returns setof public.ai_inbox
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  return query
  select *
  from public.ai_inbox
  where status = '未処理'
  order by created_at asc;
end;
$$;

comment on function public.list_ai_inbox_pending() is '未処理の話しかけを古い順に返す。読むだけでは各欄を作らない';

create or replace function public.complete_ai_inbox(
  id uuid,
  status text,
  result_summary text,
  result_links jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  if complete_ai_inbox.id is null then
    raise exception '話しかけが指定されていません';
  end if;
  if complete_ai_inbox.status not in ('未処理', '処理中', '処理済', '要確認') then
    raise exception '状態は 未処理、処理中、処理済、要確認 のいずれかです';
  end if;
  if complete_ai_inbox.result_links is not null and jsonb_typeof(complete_ai_inbox.result_links) <> 'array' then
    raise exception 'result_links は配列です';
  end if;
  update public.ai_inbox
  set
    status = complete_ai_inbox.status,
    result_summary = coalesce(complete_ai_inbox.result_summary, ''),
    result_links = coalesce(complete_ai_inbox.result_links, '[]'::jsonb),
    processed_at = case
      when complete_ai_inbox.status in ('処理済', '要確認') then now()
      else null
    end
  where ai_inbox.id = complete_ai_inbox.id;
  if not found then
    raise exception '話しかけが見つかりません';
  end if;
end;
$$;

comment on function public.complete_ai_inbox(uuid, text, text, jsonb) is '話しかけの処理結果を書く。各欄への下書き作成は別の関数で行い、メールは送らない';

revoke all on function public.list_ai_inbox_pending() from public, anon;
revoke all on function public.complete_ai_inbox(uuid, text, text, jsonb) from public, anon;
grant execute on function public.list_ai_inbox_pending() to authenticated;
grant execute on function public.complete_ai_inbox(uuid, text, text, jsonb) to authenticated;
