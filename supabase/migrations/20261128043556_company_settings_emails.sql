-- 会社設定に複数のメールアドレスを持たせる。
-- emails の先頭（emails[1]）を差出人の連絡先にする。email 列は互換のため残し、常に先頭と同じにする。

alter table public.company_settings
  add column if not exists emails text[] not null default '{}';

comment on column public.company_settings.emails is '会社のメールアドレス。先頭を見積・請求メールの差出人の連絡先にする';
comment on column public.company_settings.email is '互換用。emails の先頭と同じ';

update public.company_settings
set emails = case
  when btrim(email) = '' then '{}'::text[]
  else array[btrim(email)]
end
where cardinality(emails) = 0;

create or replace function public.sync_company_settings_email()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  cleaned text[];
  email_only boolean;
begin
  select coalesce(array_agg(addr order by ord), '{}'::text[])
    into cleaned
  from (
    select btrim(item) as addr, ordinality as ord
    from unnest(coalesce(new.emails, '{}'::text[])) with ordinality as listed(item, ordinality)
  ) trimmed
  where addr <> '';

  email_only := tg_op = 'UPDATE'
    and new.email is distinct from old.email
    and new.emails is not distinct from old.emails;

  if email_only then
    if btrim(coalesce(new.email, '')) = '' then
      new.emails := coalesce(cleaned[2:cardinality(cleaned)], '{}'::text[]);
    elsif cardinality(cleaned) = 0 then
      new.emails := array[btrim(new.email)];
    else
      new.emails := array[btrim(new.email)] || coalesce(cleaned[2:cardinality(cleaned)], '{}'::text[]);
    end if;
  else
    new.emails := cleaned;
  end if;

  if exists (
    select 1
    from unnest(new.emails) as addr
    where addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'メールアドレスの形式を確認してください';
  end if;

  new.email := coalesce(new.emails[1], '');
  return new;
end;
$$;

comment on function public.sync_company_settings_email() is 'emails を整え、email 列を先頭のアドレスに合わせる。email だけ更新したときは先頭を差し替える';

drop trigger if exists company_settings_sync_email on public.company_settings;
create trigger company_settings_sync_email
  before insert or update on public.company_settings
  for each row execute function public.sync_company_settings_email();

revoke all on function public.sync_company_settings_email() from public, anon;
grant execute on function public.sync_company_settings_email() to authenticated;

create or replace function public.get_company_settings()
returns public.company_settings
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  row public.company_settings;
begin
  perform public.require_login();
  select * into row from public.company_settings where id = 1;
  return row;
end;
$$;

comment on function public.get_company_settings() is '導入先の会社名、業種、住所、電話、メール（emails）を1行で返す。email は emails の先頭';

drop function if exists public.set_company_settings(text, text, text, text, text);

create or replace function public.set_company_settings(
  company_name text,
  trade text,
  address text default '',
  phone text default '',
  email text default null,
  emails text[] default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  update public.company_settings
  set
    company_name = coalesce(nullif(btrim(coalesce(set_company_settings.company_name, '')), ''), company_settings.company_name),
    trade = coalesce(btrim(coalesce(set_company_settings.trade, '')), ''),
    address = coalesce(btrim(coalesce(set_company_settings.address, '')), ''),
    phone = coalesce(btrim(coalesce(set_company_settings.phone, '')), ''),
    emails = case
      when set_company_settings.emails is not null then set_company_settings.emails
      else company_settings.emails
    end,
    email = case
      when set_company_settings.emails is not null then company_settings.email
      when set_company_settings.email is not null then set_company_settings.email
      else company_settings.email
    end
  where id = 1;
end;
$$;

comment on function public.set_company_settings(text, text, text, text, text, text[]) is '会社情報を更新する。emails を渡すとそれを保存し、email 列は先頭になる。emails を省略して email だけ渡すと先頭を差し替える。会社名が空なら今の名前を残す';

revoke all on function public.set_company_settings(text, text, text, text, text, text[]) from public, anon;
grant execute on function public.set_company_settings(text, text, text, text, text, text[]) to authenticated;
