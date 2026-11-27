-- IMG株式会社 社内ポータル: 現場・出張・書類・請求・売上・写真
-- 見積と同じく、ログイン済み（authenticated）だけが読み書きできる。anon には権限を付けない。
-- 社内の共有台帳なので、招待された利用者は全行を操作できる。

alter table public.estimates
  add column job_id uuid,
  add column awaiting_confirmation boolean not null default false,
  add column confirmed_at timestamptz;

comment on column public.estimates.awaiting_confirmation is '担当者の確認待ち。確認してもメールは送らない';
comment on column public.estimates.confirmed_at is '担当者が確認した時刻。送信はしていない';

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete restrict,
  title text not null,
  site_name text,
  address text,
  phase text not null default 'plan',
  start_date date,
  end_date date,
  progress integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_phase_check check (phase in ('plan', 'active', 'done')),
  constraint jobs_progress_check check (progress >= 0 and progress <= 100)
);

comment on table public.jobs is '現場・案件';
comment on column public.jobs.phase is 'plan=予定, active=実行, done=完了';
comment on column public.jobs.progress is '進捗 0-100';

create table public.job_days (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  work_date date,
  work_content text not null default '',
  paint text,
  assignee text,
  hours numeric(6, 2) not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_days_hours_check check (hours >= 0)
);

comment on table public.job_days is '案件の日別工程（作業内容・塗料・担当・時間）';

create table public.job_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  category text not null default '材料',
  label text not null,
  amount numeric(14, 0) not null default 0,
  cost_date date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_costs_category_check check (category in ('人件費', '材料', '外注', '交通', 'その他')),
  constraint job_costs_amount_check check (amount >= 0)
);

comment on table public.job_costs is '案件の原価。売上との差が粗利';

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs (id) on delete set null,
  title text not null,
  depart_on date,
  return_on date,
  lodging text,
  travel_notes text,
  notes text,
  awaiting_confirmation boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trips is '出張・準備。宿泊メモは下書きであり、このアプリは手配しない';

create table public.trip_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trip_checks is '出張の持ち物チェック';

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete set null,
  title text not null,
  doc_kind text not null default 'その他',
  status text not null default 'missing',
  due_on date,
  notes text,
  storage_path text,
  awaiting_confirmation boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_kind_check check (doc_kind in ('注文書', '契約書', '入館申請', 'その他')),
  constraint documents_status_check check (status in ('missing', 'pending', 'active', 'soon'))
);

comment on table public.documents is '契約・書類。ファイルは非公開ストレージ。送信はしない';
comment on column public.documents.status is 'missing=未提出, pending=確認待ち, active=有効, soon=期限が近い';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null,
  estimate_id uuid references public.estimates (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  customer_id uuid references public.customers (id) on delete restrict,
  site_name text,
  title text,
  issue_date date,
  due_on date,
  status text not null default 'draft',
  notes text,
  subtotal numeric(14, 0) not null default 0,
  tax_rate numeric(5, 4) not null default 0.10,
  tax numeric(14, 0) not null default 0,
  total numeric(14, 0) not null default 0,
  awaiting_confirmation boolean not null default false,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_invoice_no_key unique (invoice_no),
  constraint invoices_status_check check (status in ('draft', 'sent', 'paid', 'void')),
  constraint invoices_tax_rate_check check (tax_rate >= 0),
  constraint invoices_amounts_check check (subtotal >= 0 and tax >= 0 and total >= 0)
);

comment on table public.invoices is '請求書。メールは下書きのみで、このアプリは送信しない';
comment on column public.invoices.status is 'draft=下書き, sent=提出済み, paid=入金済, void=取消';

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  sort integer not null default 0,
  item_name text not null,
  spec text,
  quantity numeric(14, 3) not null default 0,
  unit text,
  unit_price numeric(14, 0) not null default 0,
  amount numeric(14, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_items_quantity_check check (quantity >= 0),
  constraint invoice_items_price_check check (unit_price >= 0),
  constraint invoice_items_amount_check check (amount >= 0)
);

comment on table public.invoice_items is '請求明細';

create table public.site_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  stage text not null default 'other',
  caption text,
  storage_path text not null,
  taken_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_photos_stage_check check (stage in ('undercoat', 'top1', 'top2', 'finished', 'other'))
);

comment on table public.site_photos is '現場写真。実ファイルは非公開バケット site-photos';
comment on column public.site_photos.stage is 'undercoat=下塗り, top1=上塗り1回目, top2=上塗り2回目, finished=塗り終わり, other=その他';

alter table public.estimates
  add constraint estimates_job_id_fkey foreign key (job_id) references public.jobs (id) on delete set null;

create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_phase_idx on public.jobs (phase);
create index job_days_job_id_idx on public.job_days (job_id, sort);
create index job_costs_job_id_idx on public.job_costs (job_id);
create index trips_job_id_idx on public.trips (job_id);
create index trip_checks_trip_id_idx on public.trip_checks (trip_id, sort);
create index documents_job_id_idx on public.documents (job_id);
create index documents_customer_id_idx on public.documents (customer_id);
create index documents_awaiting_idx on public.documents (updated_at desc) where awaiting_confirmation;
create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_job_id_idx on public.invoices (job_id);
create index invoices_estimate_id_idx on public.invoices (estimate_id);
create index invoices_status_idx on public.invoices (status);
create index invoices_awaiting_idx on public.invoices (updated_at desc) where awaiting_confirmation;
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id, sort);
create index site_photos_job_id_idx on public.site_photos (job_id, stage);
create index estimates_job_id_idx on public.estimates (job_id);
create index estimates_awaiting_idx on public.estimates (updated_at desc) where awaiting_confirmation;
create index trips_awaiting_idx on public.trips (updated_at desc) where awaiting_confirmation;

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger job_days_set_updated_at before update on public.job_days
  for each row execute function public.set_updated_at();
create trigger job_costs_set_updated_at before update on public.job_costs
  for each row execute function public.set_updated_at();
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger trip_checks_set_updated_at before update on public.trip_checks
  for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger invoice_items_set_updated_at before update on public.invoice_items
  for each row execute function public.set_updated_at();
create trigger site_photos_set_updated_at before update on public.site_photos
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
alter table public.job_days enable row level security;
alter table public.job_costs enable row level security;
alter table public.trips enable row level security;
alter table public.trip_checks enable row level security;
alter table public.documents enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.site_photos enable row level security;

alter table public.jobs force row level security;
alter table public.job_days force row level security;
alter table public.job_costs force row level security;
alter table public.trips force row level security;
alter table public.trip_checks force row level security;
alter table public.documents force row level security;
alter table public.invoices force row level security;
alter table public.invoice_items force row level security;
alter table public.site_photos force row level security;

create policy jobs_authenticated_all on public.jobs for all to authenticated using (true) with check (true);
create policy job_days_authenticated_all on public.job_days for all to authenticated using (true) with check (true);
create policy job_costs_authenticated_all on public.job_costs for all to authenticated using (true) with check (true);
create policy trips_authenticated_all on public.trips for all to authenticated using (true) with check (true);
create policy trip_checks_authenticated_all on public.trip_checks for all to authenticated using (true) with check (true);
create policy documents_authenticated_all on public.documents for all to authenticated using (true) with check (true);
create policy invoices_authenticated_all on public.invoices for all to authenticated using (true) with check (true);
create policy invoice_items_authenticated_all on public.invoice_items for all to authenticated using (true) with check (true);
create policy site_photos_authenticated_all on public.site_photos for all to authenticated using (true) with check (true);

revoke all on table public.jobs from anon, public;
revoke all on table public.job_days from anon, public;
revoke all on table public.job_costs from anon, public;
revoke all on table public.trips from anon, public;
revoke all on table public.trip_checks from anon, public;
revoke all on table public.documents from anon, public;
revoke all on table public.invoices from anon, public;
revoke all on table public.invoice_items from anon, public;
revoke all on table public.site_photos from anon, public;

grant select, insert, update, delete on table public.jobs to authenticated;
grant select, insert, update, delete on table public.job_days to authenticated;
grant select, insert, update, delete on table public.job_costs to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.trip_checks to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.invoice_items to authenticated;
grant select, insert, update, delete on table public.site_photos to authenticated;

revoke truncate, references, trigger on table public.jobs from authenticated;
revoke truncate, references, trigger on table public.job_days from authenticated;
revoke truncate, references, trigger on table public.job_costs from authenticated;
revoke truncate, references, trigger on table public.trips from authenticated;
revoke truncate, references, trigger on table public.trip_checks from authenticated;
revoke truncate, references, trigger on table public.documents from authenticated;
revoke truncate, references, trigger on table public.invoices from authenticated;
revoke truncate, references, trigger on table public.invoice_items from authenticated;
revoke truncate, references, trigger on table public.site_photos from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]),
  ('site-photos', 'site-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy documents_bucket_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');
create policy documents_bucket_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents');
create policy documents_bucket_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
create policy documents_bucket_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents');

create policy site_photos_bucket_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'site-photos');
create policy site_photos_bucket_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-photos');
create policy site_photos_bucket_authenticated_update on storage.objects
  for update to authenticated
  using (bucket_id = 'site-photos')
  with check (bucket_id = 'site-photos');
create policy site_photos_bucket_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-photos');
