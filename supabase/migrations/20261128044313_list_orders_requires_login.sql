-- list_orders も他の操作関数と同じく、ログイン済みだけが呼べるようにする。

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

revoke all on function public.list_orders(date, date) from public, anon;
grant execute on function public.list_orders(date, date) to authenticated;
