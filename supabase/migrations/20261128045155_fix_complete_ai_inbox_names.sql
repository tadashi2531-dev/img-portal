-- complete_ai_inbox の引数名が列名と重なって結果の保存に失敗していたので、引数側を明示する。
-- 定義の本体は 20261128045002_ai_inbox.sql の関数と同じ。本番へ再実行しない。

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
