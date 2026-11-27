import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { clearFiction, listInbox, seedFiction, setReview } from "../lib/portalApi.ts";
import type { InboxItem } from "../lib/portalTypes.ts";

const TABLE = { estimate: "estimates", invoice: "invoices", document: "documents", trip: "trips" } as const;

export function InboxPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setRows(await listInbox());
  }

  useEffect(() => {
    void reload().catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>確認待ち</h1>
        <p className="lead">見積、請求、書類、出張の宿メモです。確認しても、メール送信や宿泊手配はしません。</p>
      </div>
      <p className="mail-warning">送信は担当者が確認してから。この画面からは送信しません。</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      {rows.length === 0 ? <Banner>確認待ちはありません。</Banner> : null}
      {rows.map((row) => (
        <article key={`${row.kind}-${row.id}`} className="card stack">
          <div className="quote-top">
            <div>
              <span className="pill pill-sent">{row.kindLabel}</span>
              <h2>{row.title}</h2>
              <p className="meta">{row.detail}</p>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn quiet" type="button" onClick={() => navigate(row.href)}>
              開く
            </button>
            <button
              className="btn"
              type="button"
              onClick={() =>
                void setReview(TABLE[row.kind], row.id, false)
                  .then(reload)
                  .then(() => setNotice("確認済みにしました。送信も手配もしていません。"))
                  .catch((caught: unknown) => setError(toMessage(caught)))
              }
            >
              確認した（送らない）
            </button>
          </div>
        </article>
      ))}
      <section className="card stack">
        <h2>架空の見本</h2>
        <p className="fine">画面の確認用です。名前はすべて「架空）」で始まり、実在の顧客ではありません。</p>
        <div className="row-actions">
          <button
            className="btn quiet"
            type="button"
            onClick={() =>
              void seedFiction()
                .then(reload)
                .then(() => setNotice("架空の見本を入れました。"))
                .catch((caught: unknown) => setError(toMessage(caught)))
            }
          >
            架空の見本を入れる
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() =>
              void clearFiction()
                .then(reload)
                .then(() => setNotice("架空の見本を消しました。"))
                .catch((caught: unknown) => setError(toMessage(caught)))
            }
          >
            架空の見本を消す
          </button>
        </div>
      </section>
    </div>
  );
}
