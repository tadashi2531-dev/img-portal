import { useEffect, useState } from "react";
import { Banner } from "../components/ui.tsx";
import { useCompany } from "../components/CompanyContext.tsx";
import { toMessage } from "../lib/errors.ts";
import { supabase } from "../lib/supabase.ts";

export function SettingsPage() {
  const { settings, reload } = useCompany();
  const [form, setForm] = useState(settings);
  useEffect(() => {
    setForm(settings);
  }, [settings]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setError("");
    const { error: rpcError } = await supabase.rpc("set_company_settings", {
      company_name: form.companyName,
      trade: form.trade,
      address: form.address,
      phone: form.phone,
      email: form.email,
    });
    if (rpcError) {
      setError(toMessage(rpcError));
      return;
    }
    await reload();
    setNotice("会社情報を保存しました。");
  }

  return (
    <div className="stack">
      <div>
        <h1>会社設定</h1>
        <p className="lead">見積書、請求書、メールの差出人はここを使います。他社へ導入するときは、この会社の名前と連絡先に変えます。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>会社名</span>
          <input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
        </label>
        <label className="field">
          <span>業種</span>
          <input value={form.trade} onChange={(event) => setForm({ ...form, trade: event.target.value })} />
        </label>
        <label className="field">
          <span>住所</span>
          <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </label>
        <label className="field">
          <span>電話</span>
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        <label className="field">
          <span>メール</span>
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <button className="btn" type="submit">
          保存する
        </button>
        <p className="fine">いまの登録: {settings.companyName || "未設定"} {settings.trade}</p>
      </form>
    </div>
  );
}
