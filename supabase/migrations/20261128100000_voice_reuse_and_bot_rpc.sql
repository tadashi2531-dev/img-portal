-- 過去見積の参照、会社設定、Grok Bot 向けの操作関数。
-- 関数は security invoker。呼び出し元の RLS がそのまま効く。
-- authenticated だけが実行できる。anon と public からは外す。
-- 作成系は下書きまたは確認待ちだけを作る。メールは下書き行を残すだけで送信しない。

alter table public.estimates
  add column source_estimate_id uuid references public.estimates (id) on delete set null;

comment on column public.estimates.source_estimate_id is '複製元の見積。過去見積から作った下書きだけ入る';

create index estimates_source_estimate_id_idx on public.estimates (source_estimate_id);

create table public.company_settings (
  id integer primary key default 1,
  company_name text not null default '',
  trade text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)
);

comment on table public.company_settings is '導入先の会社情報。画面とメール文面はここを読む。コードに会社名を直書きしない';

insert into public.company_settings (id, company_name, trade)
values (1, 'IMG株式会社', '塗装・防水工事');

create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;
alter table public.company_settings force row level security;

create policy company_settings_authenticated_all
  on public.company_settings
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.company_settings from anon, public;
grant select, insert, update on table public.company_settings to authenticated;
revoke delete, truncate, references, trigger on table public.company_settings from authenticated;

alter table public.outbound_messages drop constraint outbound_messages_status_check;
alter table public.outbound_messages
  add constraint outbound_messages_status_check
  check (status in ('draft', 'sent', 'failed', 'not_configured'));

comment on column public.outbound_messages.status is 'draft=下書き（未送信）, sent=送信済み, failed=失敗, not_configured=送信設定なし';

grant insert on table public.outbound_messages to authenticated;

create policy outbound_messages_authenticated_insert_draft
  on public.outbound_messages
  for insert
  to authenticated
  with check (status = 'draft');

create or replace function public.require_login()
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
end;
$$;

comment on function public.require_login() is 'RPC の共通チェック。未ログインなら止める';

create or replace function public.ensure_customer(customer_name text)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  found_id uuid;
  clean_name text := btrim(customer_name);
begin
  perform public.require_login();
  if clean_name = '' then
    raise exception '会社名を入力してください';
  end if;
  select id into found_id from public.customers where name = clean_name limit 1;
  if found_id is null then
    insert into public.customers (name) values (clean_name) returning id into found_id;
  end if;
  return found_id;
end;
$$;

comment on function public.ensure_customer(text) is '同名の得意先があればそのID、なければ新規の得意先を作ってIDを返す';

create or replace function public.next_estimate_no()
returns text
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  year_text text := to_char(current_date, 'YYYY');
  next_number integer;
begin
  perform public.require_login();
  select coalesce(max((substring(estimate_no from '^EST-' || year_text || '-([0-9]+)$'))::integer), 0) + 1
    into next_number
  from public.estimates
  where estimate_no ~ ('^EST-' || year_text || '-[0-9]+$');
  return 'EST-' || year_text || '-' || lpad(next_number::text, 3, '0');
end;
$$;

comment on function public.next_estimate_no() is '今年の見積番号 EST-年-連番を1つ進めて返す';

create or replace function public.next_invoice_no()
returns text
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  year_text text := to_char(current_date, 'YYYY');
  next_number integer;
begin
  perform public.require_login();
  select coalesce(max((substring(invoice_no from '^INV-' || year_text || '-([0-9]+)$'))::integer), 0) + 1
    into next_number
  from public.invoices
  where invoice_no ~ ('^INV-' || year_text || '-[0-9]+$');
  return 'INV-' || year_text || '-' || lpad(next_number::text, 3, '0');
end;
$$;

comment on function public.next_invoice_no() is '今年の請求番号 INV-年-連番を1つ進めて返す';

create or replace function public.find_similar_estimates(query text)
returns table (
  id uuid,
  estimate_no text,
  title text,
  site_name text,
  customer_name text,
  issue_date date,
  total numeric,
  score integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  clean_query text := btrim(coalesce(query, ''));
begin
  perform public.require_login();
  return query
  with tokens as (
    select token
    from (
      select btrim(token) as token
      from unnest(regexp_split_to_array(replace(clean_query, '　', ' '), '[[:space:]、。]+')) as token
    ) split
    where token <> '' and length(token) <= 80
  ),
  base as (
    select
      e.id,
      e.estimate_no,
      e.title,
      e.site_name,
      c.name as customer_name,
      e.issue_date,
      e.total,
      coalesce(string_agg(i.item_name, ' '), '') as item_names
    from public.estimates e
    left join public.customers c on c.id = e.customer_id
    left join public.estimate_items i on i.estimate_id = e.id
    group by e.id, c.name
  ),
  scored as (
    select
      b.id,
      b.estimate_no,
      b.title,
      b.site_name,
      b.customer_name,
      b.issue_date,
      b.total,
      case
        when clean_query = '' then 0
        else (
          select coalesce(sum(
            (case when coalesce(b.title, '') ilike '%' || replace(replace(t.token, '%', ''), '_', '') || '%' then 5 else 0 end)
            + (case when coalesce(b.site_name, '') ilike '%' || replace(replace(t.token, '%', ''), '_', '') || '%' then 4 else 0 end)
            + (case when coalesce(b.customer_name, '') ilike '%' || replace(replace(t.token, '%', ''), '_', '') || '%' then 4 else 0 end)
            + (case when b.item_names ilike '%' || replace(replace(t.token, '%', ''), '_', '') || '%' then 3 else 0 end)
          ), 0)::integer
          from tokens t
        )
      end as score
    from base b
  )
  select s.id, s.estimate_no, s.title, s.site_name, s.customer_name, s.issue_date, s.total, s.score
  from scored s
  where clean_query = '' or s.score > 0
  order by s.score desc, s.issue_date desc nulls last
  limit 20;
end;
$$;

comment on function public.find_similar_estimates(text) is '件名・現場名・顧客名・品目名のキーワードで過去見積を近い順に返す。空文字なら新しい順';

create or replace function public.clone_estimate(source_id uuid, customer_name text)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  dest_customer uuid;
begin
  perform public.require_login();
  if source_id is null then
    raise exception '元の見積が指定されていません';
  end if;
  dest_customer := public.ensure_customer(customer_name);
  insert into public.estimates (
    estimate_no, customer_id, job_id, site_name, title, issue_date, valid_until,
    status, notes, subtotal, tax_rate, tax, total, source_estimate_id, awaiting_confirmation
  )
  select
    public.next_estimate_no(), dest_customer, job_id, site_name, title, current_date, current_date + 30,
    'draft', notes, subtotal, tax_rate, tax, total, source_id, false
  from public.estimates
  where id = source_id
  returning id into new_id;
  if new_id is null then
    raise exception '元の見積が見つかりません';
  end if;
  insert into public.estimate_items (estimate_id, sort, item_name, spec, quantity, unit, unit_price, amount)
  select new_id, sort, item_name, spec, quantity, unit, unit_price, amount
  from public.estimate_items
  where estimate_id = source_id
  order by sort;
  return new_id;
end;
$$;

comment on function public.clone_estimate(uuid, text) is '過去見積と全明細を下書きとして複製し、宛先・発行日・有効期限を差し替える。送信しない';

create or replace function public.create_job(
  title text,
  site_name text,
  customer_name text,
  start_on date,
  end_on date
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  dest_customer uuid;
begin
  perform public.require_login();
  if btrim(coalesce(title, '')) = '' then
    raise exception '案件名を入力してください';
  end if;
  if btrim(coalesce(customer_name, '')) <> '' then
    dest_customer := public.ensure_customer(customer_name);
  end if;
  insert into public.jobs (customer_id, title, site_name, phase, start_date, end_date, progress)
  values (dest_customer, btrim(title), nullif(btrim(coalesce(site_name, '')), ''), 'plan', start_on, end_on, 0)
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.create_job(text, text, text, date, date) is '案件を予定（plan）で作る。進捗は0';

create or replace function public.add_job_day(
  job_id uuid,
  work_date date,
  work_content text,
  paint text default '',
  assignee text default '',
  hours numeric default 0
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  next_sort integer;
begin
  perform public.require_login();
  if job_id is null then
    raise exception '案件が指定されていません';
  end if;
  if not exists (select 1 from public.jobs where id = job_id) then
    raise exception '案件が見つかりません';
  end if;
  select coalesce(max(sort), -1) + 1 into next_sort from public.job_days where job_days.job_id = add_job_day.job_id;
  insert into public.job_days (job_id, work_date, work_content, paint, assignee, hours, sort)
  values (
    add_job_day.job_id,
    work_date,
    coalesce(nullif(btrim(coalesce(work_content, '')), ''), '（作業内容未記入）'),
    nullif(btrim(coalesce(paint, '')), ''),
    nullif(btrim(coalesce(assignee, '')), ''),
    greatest(coalesce(hours, 0), 0),
    next_sort
  )
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.add_job_day(uuid, date, text, text, text, numeric) is '案件の日別工程を1行追加する。保存済みの行であり、画面の未保存編集とは別';

create or replace function public.create_invoice_from_estimate(estimate_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
begin
  perform public.require_login();
  insert into public.invoices (
    invoice_no, estimate_id, job_id, customer_id, site_name, title, issue_date, due_on,
    status, notes, subtotal, tax_rate, tax, total, awaiting_confirmation
  )
  select
    public.next_invoice_no(), id, job_id, customer_id, site_name, title, current_date, current_date + 30,
    'draft', notes, subtotal, tax_rate, tax, total, true
  from public.estimates
  where id = estimate_id
  returning id into new_id;
  if new_id is null then
    raise exception '見積が見つかりません';
  end if;
  insert into public.invoice_items (invoice_id, sort, item_name, spec, quantity, unit, unit_price, amount)
  select new_id, sort, item_name, spec, quantity, unit, unit_price, amount
  from public.estimate_items
  where estimate_items.estimate_id = create_invoice_from_estimate.estimate_id
  order by sort;
  return new_id;
end;
$$;

comment on function public.create_invoice_from_estimate(uuid) is '見積から請求の下書きを作り、確認待ちにする。送信しない';

create or replace function public.create_trip(
  title text,
  job_id uuid default null,
  depart_on date default null,
  return_on date default null,
  site_address text default '',
  party_size integer default 1
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
begin
  perform public.require_login();
  if btrim(coalesce(title, '')) = '' then
    raise exception '出張名を入力してください';
  end if;
  insert into public.trips (
    title, job_id, depart_on, return_on, site_address, party_size, awaiting_confirmation
  )
  values (
    btrim(title),
    job_id,
    depart_on,
    return_on,
    nullif(btrim(coalesce(site_address, '')), ''),
    least(greatest(coalesce(party_size, 1), 1), 30),
    true
  )
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.create_trip(text, uuid, date, date, text, integer) is '出張を確認待ちで作る。宿の予約はしない';

create or replace function public.create_document(
  title text,
  doc_kind text default 'その他',
  customer_name text default '',
  job_id uuid default null,
  due_on date default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  dest_customer uuid;
  kind_value text := coalesce(nullif(btrim(coalesce(doc_kind, '')), ''), 'その他');
begin
  perform public.require_login();
  if btrim(coalesce(title, '')) = '' then
    raise exception '書類名を入力してください';
  end if;
  if kind_value not in ('注文書', '契約書', '入館申請', 'その他') then
    kind_value := 'その他';
  end if;
  if btrim(coalesce(customer_name, '')) <> '' then
    dest_customer := public.ensure_customer(customer_name);
  end if;
  insert into public.documents (title, doc_kind, customer_id, job_id, due_on, status, awaiting_confirmation)
  values (btrim(title), kind_value, dest_customer, job_id, due_on, 'pending', true)
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.create_document(text, text, text, uuid, date) is '書類を確認待ち（未提出の確認）で作る。ファイル送信はしない';

create or replace function public.add_pending_check(kind text, ref_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  updated_count integer;
begin
  perform public.require_login();
  if kind = 'estimate' then
    update public.estimates set awaiting_confirmation = true, confirmed_at = null where id = ref_id;
  elsif kind = 'invoice' then
    update public.invoices set awaiting_confirmation = true, confirmed_at = null where id = ref_id;
  elsif kind = 'document' then
    update public.documents set awaiting_confirmation = true, confirmed_at = null where id = ref_id;
  elsif kind = 'trip' then
    update public.trips set awaiting_confirmation = true, confirmed_at = null where id = ref_id;
  else
    raise exception '種類は estimate, invoice, document, trip のいずれかです';
  end if;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception '対象が見つかりません';
  end if;
end;
$$;

comment on function public.add_pending_check(text, uuid) is '見積・請求・書類・出張を確認待ちにする。送信や手配はしない';

create or replace function public.draft_outbound_message(
  kind text,
  ref_id uuid,
  to_email text,
  subject text,
  body text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
begin
  perform public.require_login();
  if kind not in ('estimate', 'invoice', 'document') then
    raise exception '種類は estimate, invoice, document のいずれかです';
  end if;
  if btrim(coalesce(to_email, '')) = '' or btrim(coalesce(subject, '')) = '' or btrim(coalesce(body, '')) = '' then
    raise exception '宛先、件名、本文を入力してください';
  end if;
  insert into public.outbound_messages (kind, ref_id, to_email, subject, body, status, sent_by)
  values (kind, ref_id, btrim(to_email), btrim(subject), body, 'draft', auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.draft_outbound_message(text, uuid, text, text, text) is 'メール下書きを履歴に残すだけ。送信はしない';

create or replace function public.register_site_photo(
  job_id uuid,
  stage text,
  caption text,
  storage_path text,
  taken_on date default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  stage_value text := coalesce(nullif(btrim(coalesce(stage, '')), ''), 'other');
begin
  perform public.require_login();
  if job_id is null or btrim(coalesce(storage_path, '')) = '' then
    raise exception '案件と保管パスが必要です';
  end if;
  if stage_value not in ('undercoat', 'top1', 'top2', 'finished', 'other') then
    stage_value := 'other';
  end if;
  if not exists (select 1 from public.jobs where id = job_id) then
    raise exception '案件が見つかりません';
  end if;
  insert into public.site_photos (job_id, stage, caption, storage_path, taken_on)
  values (job_id, stage_value, nullif(btrim(coalesce(caption, '')), ''), btrim(storage_path), taken_on)
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.register_site_photo(uuid, text, text, text, date) is '非公開バケットへ上げた写真の行を登録する。ファイル自体は Storage に先に置く';

create or replace function public.list_pending_checks()
returns table (
  kind text,
  ref_id uuid,
  title text,
  detail text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  return query
  select 'estimate'::text, e.id, e.estimate_no, coalesce(e.title, e.site_name, '')
  from public.estimates e
  where e.awaiting_confirmation
  union all
  select 'invoice'::text, i.id, i.invoice_no, coalesce(i.title, i.site_name, '')
  from public.invoices i
  where i.awaiting_confirmation
  union all
  select 'document'::text, d.id, d.title, d.doc_kind
  from public.documents d
  where d.awaiting_confirmation
  union all
  select 'trip'::text, t.id, t.title, coalesce(t.lodging, t.site_address, '')
  from public.trips t
  where t.awaiting_confirmation;
end;
$$;

comment on function public.list_pending_checks() is '確認待ちの見積・請求・書類・出張を返す。送信状況は変えない';

create or replace function public.get_sales_summary()
returns table (
  job_id uuid,
  title text,
  revenue numeric,
  cost numeric,
  profit numeric
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  return query
  select
    j.id,
    j.title,
    coalesce(rev.revenue, 0)::numeric,
    coalesce(costs.cost, 0)::numeric,
    (coalesce(rev.revenue, 0) - coalesce(costs.cost, 0))::numeric
  from public.jobs j
  left join (
    select invoices.job_id, sum(invoices.total) as revenue
    from public.invoices
    where invoices.status in ('sent', 'paid') and invoices.job_id is not null
    group by invoices.job_id
  ) rev on rev.job_id = j.id
  left join (
    select job_costs.job_id, sum(job_costs.amount) as cost
    from public.job_costs
    group by job_costs.job_id
  ) costs on costs.job_id = j.id
  order by j.title;
end;
$$;

comment on function public.get_sales_summary() is '案件ごとの売上（提出済み・入金済）・原価・粗利。下書き請求は売上に入れない';

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

comment on function public.get_company_settings() is '導入先の会社名、業種、住所、電話、メールを1行で返す';

create or replace function public.set_company_settings(
  company_name text,
  trade text,
  address text default '',
  phone text default '',
  email text default ''
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
    company_name = coalesce(nullif(btrim(coalesce(company_name, '')), ''), company_settings.company_name),
    trade = coalesce(btrim(coalesce(trade, '')), ''),
    address = coalesce(btrim(coalesce(address, '')), ''),
    phone = coalesce(btrim(coalesce(phone, '')), ''),
    email = coalesce(btrim(coalesce(email, '')), '')
  where id = 1;
end;
$$;

comment on function public.set_company_settings(text, text, text, text, text) is '会社情報を更新する。会社名が空なら今の名前を残す';

revoke all on function public.require_login() from public, anon;
revoke all on function public.ensure_customer(text) from public, anon;
revoke all on function public.next_estimate_no() from public, anon;
revoke all on function public.next_invoice_no() from public, anon;
revoke all on function public.find_similar_estimates(text) from public, anon;
revoke all on function public.clone_estimate(uuid, text) from public, anon;
revoke all on function public.create_job(text, text, text, date, date) from public, anon;
revoke all on function public.add_job_day(uuid, date, text, text, text, numeric) from public, anon;
revoke all on function public.create_invoice_from_estimate(uuid) from public, anon;
revoke all on function public.create_trip(text, uuid, date, date, text, integer) from public, anon;
revoke all on function public.create_document(text, text, text, uuid, date) from public, anon;
revoke all on function public.add_pending_check(text, uuid) from public, anon;
revoke all on function public.draft_outbound_message(text, uuid, text, text, text) from public, anon;
revoke all on function public.register_site_photo(uuid, text, text, text, date) from public, anon;
revoke all on function public.list_pending_checks() from public, anon;
revoke all on function public.get_sales_summary() from public, anon;
revoke all on function public.get_company_settings() from public, anon;
revoke all on function public.set_company_settings(text, text, text, text, text) from public, anon;

grant execute on function public.require_login() to authenticated;
grant execute on function public.ensure_customer(text) to authenticated;
grant execute on function public.next_estimate_no() to authenticated;
grant execute on function public.next_invoice_no() to authenticated;
grant execute on function public.find_similar_estimates(text) to authenticated;
grant execute on function public.clone_estimate(uuid, text) to authenticated;
grant execute on function public.create_job(text, text, text, date, date) to authenticated;
grant execute on function public.add_job_day(uuid, date, text, text, text, numeric) to authenticated;
grant execute on function public.create_invoice_from_estimate(uuid) to authenticated;
grant execute on function public.create_trip(text, uuid, date, date, text, integer) to authenticated;
grant execute on function public.create_document(text, text, text, uuid, date) to authenticated;
grant execute on function public.add_pending_check(text, uuid) to authenticated;
grant execute on function public.draft_outbound_message(text, uuid, text, text, text) to authenticated;
grant execute on function public.register_site_photo(uuid, text, text, text, date) to authenticated;
grant execute on function public.list_pending_checks() to authenticated;
grant execute on function public.get_sales_summary() to authenticated;
grant execute on function public.get_company_settings() to authenticated;
grant execute on function public.set_company_settings(text, text, text, text, text) to authenticated;
