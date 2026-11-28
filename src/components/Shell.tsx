import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import { useCompany } from "./CompanyContext.tsx";
import { supabase } from "../lib/supabase.ts";
import { listInbox } from "../lib/portalApi.ts";
import { HazardStripe } from "./ui.tsx";
import { useUnsaved } from "./unsaved.tsx";

const NAV = [
  { path: "/estimates", label: "見積" },
  { path: "/jobs", label: "現場" },
  { path: "/trips", label: "出張" },
  { path: "/documents", label: "書類" },
  { path: "/invoices", label: "請求" },
  { path: "/sales", label: "売上" },
  { path: "/photos", label: "写真" },
  { path: "/customers", label: "得意先" },
];

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { settings } = useCompany();
  const { dirty } = useUnsaved();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void listInbox()
      .then((rows) => setPending(rows.length))
      .catch(() => setPending(0));
  }, [location.pathname]);

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
            <div className="brand-mark">{settings.companyName || "社内ポータル"}</div>
            <div className="brand-sub">{settings.trade || "社内ポータル"}</div>
          </div>
          <div className="brand-actions">
            <button type="button" className={pending > 0 ? "logout" : "inbox-quiet"} onClick={() => go("/inbox")}>
              確認待ち {pending}
            </button>
            {session?.user.email ? <span className="who">{session.user.email}</span> : null}
            <button type="button" className="inbox-quiet" onClick={() => go("/settings")}>
              会社設定
            </button>
            <button type="button" className="logout" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        </div>
        <HazardStripe />
        <nav className="nav" aria-label="業務メニュー">
          {NAV.map((item) => (
            <button
              key={item.path}
              type="button"
              className={location.pathname.startsWith(item.path) ? "nav-btn active" : "nav-btn"}
              onClick={() => go(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
