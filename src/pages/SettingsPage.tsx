import { useEffect, useState } from "react";
import { FieldMic, useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { useCompany } from "../components/CompanyContext.tsx";
import { toMessage } from "../lib/errors.ts";
import { supabase } from "../lib/supabase.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanAddress(value: string): string {
  return value.replace(/\s+/g, "");
}

function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function SettingsPage() {
  const { settings, reload } = useCompany();
  const [form, setForm] = useState(settings);
  const [emails, setEmails] = useState<string[]>([""]);
  useEffect(() => {
    setForm(settings);
    setEmails(settings.emails.length > 0 ? settings.emails : [""]);
  }, [settings]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useVoiceApply(({ transcript }) => {
    const heard = cleanAddress(transcript);
    if (!heard) return;
    setEmails((current) => {
      const next = current.length > 0 ? [...current] : [""];
      const empty = next.findIndex((item) => !item.trim());
      if (empty >= 0) next[empty] = heard;
      else next.push(heard);
      return next;
    });
    setNotice("聞き取りをメール欄に入れました。保存はしていません。");
    setError("");
  });

  function updateEmail(index: number, value: string) {
    setEmails((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  async function save() {
    setError("");
    const next = emails.map((item) => item.trim()).filter((item) => item !== "");
    const invalid = next.find((item) => !looksLikeEmail(item));
    if (invalid) {
      setError(`「${invalid}」はメールアドレスの形式ではありません。`);
      return;
    }
    const { error: rpcError } = await supabase.rpc("set_company_settings", {
      company_name: form.companyName,
      trade: form.trade,
      address: form.address,
      phone: form.phone,
      emails: next,
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
        noValidate
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
        <div className="stack">
          <span className="field-label">メール</span>
          <p className="fine">先頭のアドレスを、見積・請求・書類メールの差出人の連絡先に使います。</p>
          {emails.map((value, index) => (
            <div className="email-row" key={index}>
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                aria-label={`メール ${index + 1}`}
                placeholder="name@example.com"
                value={value}
                onChange={(event) => updateEmail(index, event.target.value)}
              />
              <button
                className="btn danger icon-btn"
                type="button"
                aria-label={`メール ${index + 1} を外す`}
                onClick={() =>
                  setEmails((current) => {
                    const next = current.filter((_, itemIndex) => itemIndex !== index);
                    return next.length > 0 ? next : [""];
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <div className="row-actions">
            <button className="btn quiet icon-btn" type="button" aria-label="メールを追加" onClick={() => setEmails((current) => [...current, ""])}>
              +
            </button>
          </div>
          <FieldMic
            onApply={(text) => {
              const heard = cleanAddress(text);
              setEmails((current) => {
                const next = current.length > 0 ? [...current] : [""];
                const empty = next.findIndex((item) => !item.trim());
                if (empty >= 0) next[empty] = heard;
                else next.push(heard);
                return next;
              });
              setNotice("聞き取りをメール欄に入れました。保存はしていません。");
            }}
          />
        </div>
        <button className="btn" type="submit">
          保存する
        </button>
        <p className="fine">
          いまの登録: {settings.companyName || "未設定"} {settings.trade}
          {settings.emails[0] ? ` ／ ${settings.emails[0]}` : ""}
        </p>
      </form>
    </div>
  );
}
