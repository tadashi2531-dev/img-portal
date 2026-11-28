-- mark_estimate_ordered の引数名が列名と重なって受注の保存に失敗していたので、制約名で衝突を避ける。
-- 定義の本体は 20261128044831_inquiries_rpcs.sql の関数と同じ。本番へ再実行しない。

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
  if mark_estimate_ordered.estimate_id is null then
    raise exception '見積が指定されていません';
  end if;
  select * into src from public.estimates where estimates.id = mark_estimate_ordered.estimate_id;
  if src.id is null then
    raise exception '見積が見つかりません';
  end if;
  update public.estimates set status = 'accepted' where estimates.id = mark_estimate_ordered.estimate_id;
  if src.inquiry_id is not null then
    update public.inquiries set status = '受注' where inquiries.id = src.inquiry_id;
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
