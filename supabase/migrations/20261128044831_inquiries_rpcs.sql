-- 案件の操作関数。テーブルは 20261128044751_inquiries.sql。

create or replace function public.create_inquiry(
  received_on date,
  customer_name text,
  site_name text,
  details text,
  source text,
  notes text default ''
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
  site text := nullif(btrim(coalesce(site_name, '')), '');
begin
  perform public.require_login();
  if site is null then
    raise exception '現場名を入力してください';
  end if;
  if btrim(coalesce(customer_name, '')) <> '' then
    dest_customer := public.ensure_customer(customer_name);
  end if;
  insert into public.inquiries (received_on, customer_id, site_name, details, source, status, notes)
  values (
    coalesce(received_on, current_date),
    dest_customer,
    site,
    coalesce(details, ''),
    coalesce(btrim(coalesce(source, '')), ''),
    '受付',
    coalesce(notes, '')
  )
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.create_inquiry(date, text, text, text, text, text) is '案件を受付で作る。得意先名があれば ensure_customer する。見積や送信はしない';

create or replace function public.update_inquiry_status(inquiry_id uuid, status text)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  if inquiry_id is null then
    raise exception '案件が指定されていません';
  end if;
  if status not in ('受付', '見積中', '受注', '失注', '保留') then
    raise exception '状態は 受付、見積中、受注、失注、保留 のいずれかです';
  end if;
  update public.inquiries
  set status = update_inquiry_status.status
  where id = inquiry_id;
  if not found then
    raise exception '案件が見つかりません';
  end if;
end;
$$;

comment on function public.update_inquiry_status(uuid, text) is '案件の状態を変える。受注にしてもメールは送らない';

create or replace function public.list_inquiries(status_filter text default null)
returns table (
  id uuid,
  received_on date,
  customer_id uuid,
  customer_name text,
  site_name text,
  details text,
  source text,
  status text,
  notes text,
  expense_total numeric,
  estimate_id uuid,
  estimate_no text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.require_login();
  if status_filter is not null and status_filter not in ('受付', '見積中', '受注', '失注', '保留') then
    raise exception '状態は 受付、見積中、受注、失注、保留 のいずれかです';
  end if;
  return query
  select
    i.id,
    i.received_on,
    i.customer_id,
    coalesce(c.name, ''),
    i.site_name,
    i.details,
    i.source,
    i.status,
    i.notes,
    coalesce((select sum(inquiry_expenses.amount) from public.inquiry_expenses where inquiry_expenses.inquiry_id = i.id), 0),
    e.id,
    e.estimate_no
  from public.inquiries i
  left join public.customers c on c.id = i.customer_id
  left join lateral (
    select estimates.id, estimates.estimate_no
    from public.estimates
    where estimates.inquiry_id = i.id
    order by estimates.created_at desc
    limit 1
  ) e on true
  where status_filter is null or i.status = status_filter
  order by i.received_on desc, i.created_at desc;
end;
$$;

comment on function public.list_inquiries(text) is '案件の一覧。status_filter を省略すると全部。経費合計を含む。新しい受付が先';

create or replace function public.add_site_survey(
  inquiry_id uuid,
  visit_on date,
  visit_time time,
  attendees text default '',
  notes text default ''
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
  if add_site_survey.inquiry_id is null or not exists (select 1 from public.inquiries where id = add_site_survey.inquiry_id) then
    raise exception '案件が見つかりません';
  end if;
  insert into public.inquiry_surveys (inquiry_id, visit_on, visit_time, attendees, notes)
  values (
    add_site_survey.inquiry_id,
    visit_on,
    visit_time,
    coalesce(attendees, ''),
    coalesce(notes, '')
  )
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.add_site_survey(uuid, date, time, text, text) is '案件に現地調査の訪問を1件追加する。保存はするが、見積や送信はしない';

create or replace function public.add_inquiry_expense(
  inquiry_id uuid,
  spent_on date,
  category text,
  amount numeric,
  notes text default ''
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  yen numeric(14, 0) := round(coalesce(amount, 0));
begin
  perform public.require_login();
  if add_inquiry_expense.inquiry_id is null or not exists (select 1 from public.inquiries where id = add_inquiry_expense.inquiry_id) then
    raise exception '案件が見つかりません';
  end if;
  if category not in ('交通費', '高速代', '宿泊', '材料サンプル', '人工', 'その他') then
    raise exception '区分は 交通費、高速代、宿泊、材料サンプル、人工、その他 のいずれかです';
  end if;
  if yen < 0 then
    raise exception '金額は0以上にしてください';
  end if;
  insert into public.inquiry_expenses (inquiry_id, spent_on, category, amount, notes)
  values (add_inquiry_expense.inquiry_id, spent_on, category, yen, coalesce(notes, ''))
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.add_inquiry_expense(uuid, date, text, numeric, text) is '案件に経費を1行追加する。出張テーブルや工程の原価とは別';

create or replace function public.mark_estimate_ordered(estimate_id uuid, ordered_on date default current_date)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  src public.estimates;
  order_day date := coalesce(ordered_on, current_date);
begin
  perform public.require_login();
  if estimate_id is null then
    raise exception '見積が指定されていません';
  end if;
  select * into src from public.estimates where id = estimate_id;
  if src.id is null then
    raise exception '見積が見つかりません';
  end if;
  update public.estimates
  set status = 'accepted'
  where id = estimate_id;
  if src.inquiry_id is not null then
    update public.inquiries
    set status = '受注'
    where id = src.inquiry_id;
  end if;
  insert into public.orders as destination (estimate_id, customer_id, job_id, ordered_on, amount)
  values (src.id, src.customer_id, src.job_id, order_day, src.total)
  on conflict on constraint orders_estimate_id_key do update
    set ordered_on = excluded.ordered_on,
        amount = excluded.amount,
        customer_id = excluded.customer_id,
        job_id = coalesce(destination.job_id, excluded.job_id)
  returning destination.id into new_id;
  return new_id;
end;
$$;

comment on function public.mark_estimate_ordered(uuid, date) is '見積を受注にし、受注日と税込合計を残す。紐づく案件の状態も受注にする。メールは送らない';

revoke all on function public.create_inquiry(date, text, text, text, text, text) from public, anon;
revoke all on function public.update_inquiry_status(uuid, text) from public, anon;
revoke all on function public.list_inquiries(text) from public, anon;
revoke all on function public.add_site_survey(uuid, date, time, text, text) from public, anon;
revoke all on function public.add_inquiry_expense(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.create_inquiry(date, text, text, text, text, text) to authenticated;
grant execute on function public.update_inquiry_status(uuid, text) to authenticated;
grant execute on function public.list_inquiries(text) to authenticated;
grant execute on function public.add_site_survey(uuid, date, time, text, text) to authenticated;
grant execute on function public.add_inquiry_expense(uuid, date, text, numeric, text) to authenticated;
