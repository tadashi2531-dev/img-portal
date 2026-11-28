-- 問い合わせの受付台帳。現場の工程（jobs）とは別テーブル。
-- ログイン済みだけが読み書きできる。受注にしてもメールは送らない。

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  received_on date not null default current_date,
  customer_id uuid references public.customers (id) on delete restrict,
  site_name text not null,
  details text not null default '',
  source text not null default '',
  status text not null default '受付',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_status_check check (status in ('受付', '見積中', '受注', '失注', '保留')),
  constraint inquiries_site_name_check check (btrim(site_name) <> '')
);

comment on table public.inquiries is '案件。受けた問い合わせや依頼の台帳。工程の jobs とは別';
comment on column public.inquiries.received_on is '受付日';
comment on column public.inquiries.site_name is '現場名';
comment on column public.inquiries.details is '依頼内容';
comment on column public.inquiries.source is '経路。電話、LINE、紹介など';
comment on column public.inquiries.status is '受付、見積中、受注、失注、保留';

-- 出張（trips）は工程の宿泊メモで、現地調査の訪問や案件の経費行ではない。
-- 工程の原価（job_costs）は別の区分で、jobs に紐づく。案件の調査と経費は inquiries の子にする。

create table public.inquiry_surveys (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  visit_on date,
  visit_time time,
  attendees text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inquiry_surveys is '案件の現地調査。複数回の訪問を残す';
comment on column public.inquiry_surveys.visit_on is '調査日';
comment on column public.inquiry_surveys.visit_time is '調査の時刻';
comment on column public.inquiry_surveys.attendees is '同行者';

create index inquiry_surveys_inquiry_id_idx on public.inquiry_surveys (inquiry_id, visit_on);

create trigger inquiry_surveys_set_updated_at
  before update on public.inquiry_surveys
  for each row execute function public.set_updated_at();

create table public.inquiry_expenses (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  spent_on date,
  category text not null,
  amount numeric(14, 0) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiry_expenses_category_check check (category in ('交通費', '高速代', '宿泊', '材料サンプル', '人工', 'その他')),
  constraint inquiry_expenses_amount_check check (amount >= 0)
);

comment on table public.inquiry_expenses is '案件ごとの経費。交通費、高速代、宿泊、材料サンプル、人工、その他';
comment on column public.inquiry_expenses.amount is '金額。0以上';

create index inquiry_expenses_inquiry_id_idx on public.inquiry_expenses (inquiry_id, spent_on);

create trigger inquiry_expenses_set_updated_at
  before update on public.inquiry_expenses
  for each row execute function public.set_updated_at();

alter table public.inquiry_surveys enable row level security;
alter table public.inquiry_surveys force row level security;
alter table public.inquiry_expenses enable row level security;
alter table public.inquiry_expenses force row level security;

create policy inquiry_surveys_authenticated_all
  on public.inquiry_surveys
  for all
  to authenticated
  using (true)
  with check (true);

create policy inquiry_expenses_authenticated_all
  on public.inquiry_expenses
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.inquiry_surveys from anon, public;
revoke all on table public.inquiry_expenses from anon, public;
grant select, insert, update, delete on table public.inquiry_surveys to authenticated;
grant select, insert, update, delete on table public.inquiry_expenses to authenticated;

create index inquiries_received_on_idx on public.inquiries (received_on desc);
create index inquiries_status_idx on public.inquiries (status);
create index inquiries_customer_id_idx on public.inquiries (customer_id);

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.estimates
  add column inquiry_id uuid references public.inquiries (id) on delete set null;

comment on column public.estimates.inquiry_id is 'この見積の元になった案件';
create index estimates_inquiry_id_idx on public.estimates (inquiry_id);

alter table public.inquiries enable row level security;
alter table public.inquiries force row level security;

create policy inquiries_authenticated_all
  on public.inquiries
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.inquiries from anon, public;
grant select, insert, update, delete on table public.inquiries to authenticated;
