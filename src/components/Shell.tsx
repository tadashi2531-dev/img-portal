import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import { supabase } from "../lib/supabase.ts";
import { HazardStripe } from "./ui.tsx";
import { useUnsaved } from "./unsaved.tsx";

const COMING_SOON = ["現場・案件", "出張・準備", "契約・書類", "請求発行", "売上・粗利"];

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { dirty } = useUnsaved();
  const estimatesActive = location.pathname.startsWith("/estimates");
  const customersActive = location.pathname.startsWith("/customers");

  function go(path: string) {
    if (location.pathname === path) return;
    if (dirty && !window.confirm("保存していない変更があります。画面を離れますか？")) return;
    navigate(path);
  }

  async function logout() {
    if (dirty && !window.confirm("保存していない変更があります。ログアウトしますか？")) return;
    await supabase.auth.signOut();
  }

  return (
    <div className="app">
      <header className="site-header no-print">
        <HazardStripe />
        <div className="brand-bar">
          <div className="brand-copy">
            <div className="brand-mark">IMG株式会社</div>
            <div className="brand-sub">社内ポータル · 塗装・防水</div>
          </div>
          <div className="brand-actions">
            {session?.user.email ? <span className="who">{session.user.email}</span> : null}
            <button type="button" className="logout" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        </div>
        <HazardStripe />
        <nav className="nav" aria-label="業務メニュー">
          <button type="button" className={estimatesActive ? "nav-btn active" : "nav-btn"} onClick={() => go("/estimates")}>
            見積
          </button>
          <button type="button" className={customersActive ? "nav-btn active" : "nav-btn"} onClick={() => go("/customers")}>
            得意先
          </button>
          {COMING_SOON.map((label) => (
            <button key={label} type="button" className="nav-btn" disabled title="準備中です">
              {label}
              <span className="soon">準備中</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
