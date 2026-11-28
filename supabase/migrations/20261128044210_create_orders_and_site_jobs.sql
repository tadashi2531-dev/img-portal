-- 受注を見積の確定額で残す。現場は現場名で識別し、title は現場名と同じ値にする。
-- 関数は security invoker。authenticated だけが実行できる。受注にしてもメールは送らない。

update public.jobs
set site_name = btrim(title)
where site_name is null or btrim(site_name) = '';

update public.jobs
set title = btrim(site_name)
where btrim(coalesce(site_name, '')) <> ''
  and btrim(coalesce(title, '')) is distinct from btrim(site_name);

create or replace function public.sync_job_site_name()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if btrim(coalesce(new.site_name, '')) = '' then
    new.site_name := nullif(btrim(coalesce(new.title, '')), '');
  end if;
  if btrim(coalesce(new.site_name, '')) = '' then
    raise exception '現場名を入力してください';
  end if;
  new.site_name := btrim(new.site_name);
  new.title := new.site_name;
  return new;
end;
$$;

comment on function public.sync_job_site_name() is '現場名を必須にし、title 列へ同じ値を入れる。title だけ渡した既存の作成も壊れない';

drop trigger if exists jobs_sync_site_name on public.jobs;
create trigger jobs_sync_site_name
  before insert or update on public.jobs
  for each row execute function public.sync_job_site_name();

revoke all on function public.sync_job_site_name() from public, anon;
grant execute on function public.sync_job_site_name() to authenticated;

comment on column public.jobs.site_name is '現場名。画面ではこれで現場を識別する';
comment on column public.jobs.title is '互換用。現場名と同じ値';
comment on table public.jobs is '工程・現場管理。現場名で識別する';

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
  site text := nullif(btrim(coalesce(site_name, '')), '');
begin
  perform public.require_login();
  if site is null then
    site := nullif(btrim(coalesce(title, '')), '');
  end if;
  if site is null then
    raise exception '現場名を入力してください';
  end if;
  if btrim(coalesce(customer_name, '')) <> '' then
    dest_customer := public.ensure_customer(customer_name);
  end if;
  insert into public.jobs (customer_id, title, site_name, phase, start_date, end_date, progress)
  values (dest_customer, site, site, 'plan', start_on, end_on, 0)
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.create_job(text, text, text, date, date) is '現場を予定（plan）で作る。現場名が空なら title を現場名にする。進捗は0';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete set null,
  ordered_on date not null,
  amount numeric(14, 0) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is '受注。金額は受注にした時点の見積合計（値引き行を含む）';
comment on column public.orders.estimate_id is '元の見積。1見積につき1受注';
comment on column public.orders.ordered_on is '受注日';
comment on column public.orders.amount is '受注金額。見積の税込合計';
comment on column public.orders.job_id is '工程を作ったあとの現場';

create index orders_ordered_on_idx on public.orders (ordered_on desc);
create index orders_customer_id_idx on public.orders (customer_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.orders force row level security;

create policy orders_authenticated_all
  on public.orders
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.orders from anon, public;
grant select, insert, update, delete on table public.orders to authenticated;

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

comment on function public.mark_estimate_ordered(uuid, date) is '見積を受注にし、受注日と税込合計を残す。値引き行を含んだ合計を使う。メールは送らない';

create or replace function public.list_orders("from" date default null, "to" date default null)
returns table (
  id uuid,
  estimate_id uuid,
  estimate_no text,
  customer_name text,
  site_name text,
  job_id uuid,
  ordered_on date,
  amount numeric
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
    o.id,
    o.estimate_id,
    e.estimate_no,
    coalesce(oc.name, ec.name, ''),
    coalesce(nullif(btrim(j.site_name), ''), nullif(btrim(e.site_name), ''), nullif(btrim(e.title), ''), ''),
    o.job_id,
    o.ordered_on,
    o.amount
  from public.orders o
  join public.estimates e on e.id = o.estimate_id
  left join public.customers oc on oc.id = o.customer_id
  left join public.customers ec on ec.id = e.customer_id
  left join public.jobs j on j.id = o.job_id
  where (list_orders."from" is null or o.ordered_on >= list_orders."from")
    and (list_orders."to" is null or o.ordered_on <= list_orders."to")
  order by o.ordered_on desc, e.estimate_no desc;
end;
$$;

comment on function public.list_orders(date, date) is '受注日が from から to までの受注。省略した端は制限しない。現場名、得意先、見積番号、受注金額を返す';

revoke all on function public.mark_estimate_ordered(uuid, date) from public, anon;
revoke all on function public.list_orders(date, date) from public, anon;
grant execute on function public.mark_estimate_ordered(uuid, date) to authenticated;
grant execute on function public.list_orders(date, date) to authenticated;
