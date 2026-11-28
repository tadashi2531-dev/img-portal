-- 見積明細の単価と金額は、値引き・端数調整のためマイナスを許す。
-- 数量は 0 以上のまま。
-- 本番の allow_negative_estimate_item_amounts（版 20261128024056）と同じ変更。このファイルは記録用で、本番へ再実行しない。

alter table public.estimate_items drop constraint if exists estimate_items_amount_non_negative;
alter table public.estimate_items drop constraint if exists estimate_items_unit_price_non_negative;
