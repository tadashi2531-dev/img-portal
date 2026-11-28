import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FieldMic, useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatYen, todayISO } from "../lib/money.ts";
import { createInvoiceFromEstimate, createJobFromOrder, listOrders, type OrderRow } from "../lib/portalApi.ts";

export function OrdersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  useVoiceApply(({ transcript }) => {
    setQuery(transcript.trim());
    setNotice("聞き取りを検索欄に入れました。受注や送信はしていません。");
  });

  async function reload(nextYear = year) {
    setLoading(true);
    setError("");
    try {
      const from = `${nextYear}-01-01`;
      const to = `${nextYear}-12-31`;
      setRows(await listOrders(from, to));
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (year.length !== 4) return;
    void reload(year);
  }, [year]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ja");
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.customerName, row.siteName, row.estimateNo].join(" ").toLocaleLowerCase("ja").includes(needle),
    );
  }, [query, rows]);

  const monthKey = todayISO().slice(0, 7);
  const yearTotal = filtered.reduce((sum, row) => sum + row.amount, 0);
  const monthTotal = filtered
    .filter((row) => row.orderedOn.startsWith(monthKey) && row.orderedOn.startsWith(year))
    .reduce((sum, row) => sum + row.amount, 0);
  const byMonth = new Map<string, number>();
  for (const row of filtered) {
    const key = row.orderedOn.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + row.amount);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  async function makeJob(row: OrderRow) {
    if (!row.siteName.trim()) {
      setError("現場名がないので工程を作れません。");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const jobId = await createJobFromOrder(row);
      navigate(`/jobs/${jobId}`);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>受注</h1>
        <p className="lead">見積を受注にした分がここに残ります。金額は、値引きを含んだ見積の税込合計です。メールは送りません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack">
        <div className="grid-2">
          <label className="field">
            <span>年</span>
            <input value={year} inputMode="numeric" onChange={(event) => setYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4))} />
          </label>
          <label className="field">
            <span>検索</span>
            <input value={query} placeholder="得意先・現場名・見積番号" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <FieldMic onApply={(text) => setQuery(text.trim())} />
      </section>
      <section className="card totals">
        <div className="total-row">
          <span>{year || "年"}の合計</span>
          <strong className="money">{formatYen(yearTotal)}</strong>
        </div>
        <div className="total-row grand">
          <span>今月の合計</span>
          <strong className="money">{formatYen(monthTotal)}</strong>
        </div>
        {months.map(([key, amount]) => (
          <div className="total-row" key={key}>
            <span>{key.replace("-", "年")}月</span>
            <strong className="money">{formatYen(amount)}</strong>
          </div>
        ))}
      </section>
      {loading ? <p className="fine">読み込み中…</p> : null}
      {!loading && filtered.length === 0 ? <Banner>この年の受注はまだありません。見積画面の「受注にする」から入ります。</Banner> : null}
      {filtered.map((row) => (
        <article key={row.id} className="card stack">
          <div className="quote-top">
            <div>
              <div className="quote-no">{row.estimateNo}</div>
              <h2>{row.siteName || "現場名未設定"}</h2>
              <p className="meta">
                受注日：{formatDateJa(row.orderedOn)}
                <br />
                得意先：{row.customerName || "未設定"}
                <br />
                見積番号：{row.estimateNo}
              </p>
            </div>
            <strong className="money">{formatYen(row.amount)}</strong>
          </div>
          <div className="row-actions">
            <button className="btn quiet" type="button" onClick={() => navigate(`/estimates/${row.estimateId}`)}>
              見積を開く
            </button>
            <button className="btn quiet" type="button" disabled={busyId === row.id} onClick={() => void makeJob(row)}>
              {row.jobId ? "工程を開く" : "工程を作る"}
            </button>
            <button
              className="btn quiet"
              type="button"
              disabled={busyId === row.id}
              onClick={() =>
                void createInvoiceFromEstimate(row.estimateId)
                  .then((invoiceId) => navigate(`/invoices/${invoiceId}`))
                  .catch((caught: unknown) => setError(toMessage(caught)))
              }
            >
              請求を作る
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
