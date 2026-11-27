-- authenticated に付いていた TRUNCATE / REFERENCES / TRIGGER を外す。
-- TRUNCATE は RLS の対象外のため、社内ユーザーでも全行削除できてしまう。
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.customers FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.estimates FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.estimate_items FROM authenticated;
