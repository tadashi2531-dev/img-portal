import { useState, type FormEvent } from "react";
import { COMPANY_NAME } from "../lib/config.ts";
import { loginErrorMessage } from "../lib/errors.ts";
import { supabase } from "../lib/supabase.ts";
import { HazardStripe } from "../components/ui.tsx";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(loginErrorMessage(signInError.message));
    }
  }

  return (
    <div className="login">
      <HazardStripe />
      <div className="brand-bar">
        <div>
          <div className="brand-mark">IMG株式会社</div>
          <div className="brand-sub">社内ポータル · 塗装・防水</div>
        </div>
      </div>
      <HazardStripe />
      <main className="login-main">
        <h1>ログイン</h1>
        <p className="lead">
          {COMPANY_NAME}の見積を扱う社内画面です。アカウントは管理者からの招待制です。この画面から新規登録はできません。
        </p>
        <form className="stack" onSubmit={(event) => void onSubmit(event)}>
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}
          <label className="field">
            <span>
              メールアドレス<span className="req"> *</span>
            </span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span>
              パスワード<span className="req"> *</span>
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "ログイン中…" : "ログイン"}
          </button>
        </form>
        <p className="fine">見積や請求のメールは、下書きを確認して送信ボタンを押したときだけ送ります。</p>
      </main>
    </div>
  );
}
