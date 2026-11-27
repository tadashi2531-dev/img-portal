-- IMG株式会社 社内ポータル: 見積スキーマ
-- 業務データはログイン済み（authenticated）のみ操作可。anon には権限を付けない。

-- 共通: updated_at を自動更新
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

-- 見積ステータス
CREATE TYPE public.estimate_status AS ENUM ('draft', 'sent', 'accepted', 'lost');
COMMENT ON TYPE public.estimate_status IS '見積ステータス: draft=下書き, sent=提出済, accepted=受注, lost=失注';

-- 得意先
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customers IS '得意先（塗装・防水工事の顧客）';
COMMENT ON COLUMN public.customers.name IS '得意先名';
COMMENT ON COLUMN public.customers.contact IS '担当者・電話・メールなど連絡先';
COMMENT ON COLUMN public.customers.address IS '住所';
COMMENT ON COLUMN public.customers.notes IS '備考';

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 見積
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_no text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  site_name text,
  title text,
  issue_date date,
  valid_until date,
  status public.estimate_status NOT NULL DEFAULT 'draft',
  notes text,
  subtotal numeric(14, 0) NOT NULL DEFAULT 0,
  tax_rate numeric(5, 4) NOT NULL DEFAULT 0.10,
  tax numeric(14, 0) NOT NULL DEFAULT 0,
  total numeric(14, 0) NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimates_estimate_no_key UNIQUE (estimate_no),
  CONSTRAINT estimates_tax_rate_non_negative CHECK (tax_rate >= 0),
  CONSTRAINT estimates_amounts_non_negative CHECK (subtotal >= 0 AND tax >= 0 AND total >= 0)
);

COMMENT ON TABLE public.estimates IS '見積書ヘッダ';
COMMENT ON COLUMN public.estimates.estimate_no IS '見積番号';
COMMENT ON COLUMN public.estimates.customer_id IS '得意先';
COMMENT ON COLUMN public.estimates.site_name IS '現場名';
COMMENT ON COLUMN public.estimates.title IS '件名';
COMMENT ON COLUMN public.estimates.issue_date IS '発行日';
COMMENT ON COLUMN public.estimates.valid_until IS '有効期限';
COMMENT ON COLUMN public.estimates.status IS 'ステータス';
COMMENT ON COLUMN public.estimates.notes IS '備考';
COMMENT ON COLUMN public.estimates.subtotal IS '小計（税別）';
COMMENT ON COLUMN public.estimates.tax_rate IS '消費税率（既定 0.10）';
COMMENT ON COLUMN public.estimates.tax IS '消費税額';
COMMENT ON COLUMN public.estimates.total IS '合計（税込）';
COMMENT ON COLUMN public.estimates.created_by IS '作成者（auth.uid）';

CREATE INDEX estimates_customer_id_idx ON public.estimates (customer_id);
CREATE INDEX estimates_status_idx ON public.estimates (status);
CREATE INDEX estimates_created_by_idx ON public.estimates (created_by);
CREATE INDEX estimates_issue_date_idx ON public.estimates (issue_date DESC);

CREATE TRIGGER estimates_set_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 見積明細
CREATE TABLE public.estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  item_name text NOT NULL,
  spec text,
  quantity numeric(14, 3) NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric(14, 0) NOT NULL DEFAULT 0,
  amount numeric(14, 0) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_items_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT estimate_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT estimate_items_amount_non_negative CHECK (amount >= 0)
);

COMMENT ON TABLE public.estimate_items IS '見積明細行';
COMMENT ON COLUMN public.estimate_items.estimate_id IS '見積ID';
COMMENT ON COLUMN public.estimate_items.sort IS '表示順';
COMMENT ON COLUMN public.estimate_items.item_name IS '品名';
COMMENT ON COLUMN public.estimate_items.spec IS '仕様';
COMMENT ON COLUMN public.estimate_items.quantity IS '数量';
COMMENT ON COLUMN public.estimate_items.unit IS '単位（㎡, m, 式, 缶 など）';
COMMENT ON COLUMN public.estimate_items.unit_price IS '単価';
COMMENT ON COLUMN public.estimate_items.amount IS '金額';

CREATE INDEX estimate_items_estimate_id_idx ON public.estimate_items (estimate_id);
CREATE INDEX estimate_items_estimate_id_sort_idx ON public.estimate_items (estimate_id, sort);

CREATE TRIGGER estimate_items_set_updated_at
  BEFORE UPDATE ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 社内ポータルのため、招待された authenticated 全員が全行を操作できる。
-- anon にはポリシーも GRANT も付けない。
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.estimates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items FORCE ROW LEVEL SECURITY;

CREATE POLICY customers_authenticated_all
  ON public.customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY estimates_authenticated_all
  ON public.estimates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY estimate_items_authenticated_all
  ON public.estimate_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.customers FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.estimates FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.estimate_items FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estimates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estimate_items TO authenticated;

GRANT USAGE ON TYPE public.estimate_status TO authenticated;
