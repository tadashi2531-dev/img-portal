-- 請求明細の単価と金額も、値引き・端数調整のためマイナスを許す。
-- 見積・請求の小計・消費税・合計は、マイナス行を含めた結果が負でも保存できる。
-- 数量と税率は 0 以上のまま。
-- 見積明細側は 20261128024056_allow_negative_estimate_item_amounts.sql（本番適用済み）で解放済み。

alter table public.invoice_items drop constraint if exists invoice_items_price_check;
alter table public.invoice_items drop constraint if exists invoice_items_amount_check;

alter table public.estimates drop constraint if exists estimates_amounts_non_negative;
alter table public.invoices drop constraint if exists invoices_amounts_check;

comment on column public.estimate_items.unit_price is '単価。値引き行はマイナス';
comment on column public.estimate_items.amount is '金額（数量×単価）。値引き行はマイナス';
comment on column public.invoice_items.unit_price is '単価。値引き行はマイナス';
comment on column public.invoice_items.amount is '金額（数量×単価）。値引き行はマイナス';
comment on column public.estimates.subtotal is '小計（税別）。値引き行を含む。マイナスになり得る';
comment on column public.estimates.tax is '消費税額。小計がマイナスならマイナス';
comment on column public.estimates.total is '合計（税込）。値引き行を含む。マイナスになり得る';
comment on column public.invoices.subtotal is '小計（税別）。値引き行を含む。マイナスになり得る';
comment on column public.invoices.tax is '消費税額。小計がマイナスならマイナス';
comment on column public.invoices.total is '合計（税込）。値引き行を含む。マイナスになり得る';
