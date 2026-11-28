-- set_company_settings の引数名が列名と重なって保存に失敗していたので、引数側を明示する。

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
