-- 送信履歴、宿の記録、現場の緯度経度。
-- ログイン済みだけが読める。送信履歴の書き込みは Edge Function（service role）だけ。

alter table public.jobs
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add constraint jobs_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint jobs_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180));

comment on column public.jobs.latitude is '天気取得用。空なら住所から求める';
comment on column public.jobs.longitude is '天気取得用。空なら住所から求める';

alter table public.trips
  add column party_size integer not null default 1,
  add column site_address text,
  add column hotel_name text,
  add column reservation_no text,
  add column lodging_price numeric(14, 0),
  add column check_in date,
  add column check_out date,
  add constraint trips_party_size_check check (party_size >= 1 and party_size <= 30),
  add constraint trips_lodging_price_check check (lodging_price is null or lodging_price >= 0);

comment on column public.trips.hotel_name is '予約したホテル名。このアプリは予約しない';
comment on column public.trips.reservation_no is '予約番号';
comment on column public.trips.lodging_price is '宿泊料金（円）';

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ref_id uuid,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null,
  provider_id text,
  error text,
  has_attachment boolean not null default false,
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint outbound_messages_kind_check check (kind in ('estimate', 'invoice', 'document')),
  constraint outbound_messages_status_check check (status in ('sent', 'failed', 'not_configured'))
);

comment on table public.outbound_messages is '見積・請求・書類メールの送信履歴。自動送信はしない';
comment on column public.outbound_messages.status is 'sent=送信済み, failed=失敗, not_configured=送信設定が未設定で送っていない';

create index outbound_messages_ref_idx on public.outbound_messages (kind, ref_id, created_at desc);
create index outbound_messages_created_idx on public.outbound_messages (created_at desc);

alter table public.outbound_messages enable row level security;
alter table public.outbound_messages force row level security;

create policy outbound_messages_authenticated_select
  on public.outbound_messages
  for select
  to authenticated
  using (true);

revoke all on table public.outbound_messages from anon, public;
grant select on table public.outbound_messages to authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.outbound_messages from authenticated;
