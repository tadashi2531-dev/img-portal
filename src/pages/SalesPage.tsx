import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { formatYen } from "../lib/money.ts";
import { salesRows } from "../lib/portalApi.ts";

export function SalesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof salesRows>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void salesRows()
      .then(setRows)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const draft = rows.reduce((sum, row) => sum + row.draftRevenue, 0);

  return (
    <div className="stack">
      <div>
        <h1>売上・粗利</h1>
        <p className="lead">案件ごとの売上は、提出済みと入金済の請求の合計です。原価は案件に入れた金額です。下書きの請求は売上に入れていません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="totals card">
        <div className="total-row">
          <span>売上（税込）</span>
          <strong className="money">{formatYen(revenue)}</strong>
        </div>
        <div className="total-row">
          <span>原価</span>
          <strong className="money">{formatYen(cost)}</strong>
        </div>
        <div className="total-row grand">
          <span>粗利</span>
          <strong className="money">{formatYen(revenue - cost)}</strong>
        </div>
        <p className="fine">下書きの請求 {formatYen(draft)} は含めていません。</p>
      </section>
      {rows.map((row) => {
        const profit = row.revenue - row.cost;
        return (
          <article key={row.id} className="card">
            <FictionNote text={row.title} />
            <h2>{row.title}</h2>
            <p className="meta">現場名：{row.siteName || "未設定"}</p>
            <div className="total-row">
              <span>売上</span>
              <strong className="money">{formatYen(row.revenue)}</strong>
            </div>
            <div className="total-row">
              <span>下書き請求</span>
              <strong className="money">{formatYen(row.draftRevenue)}</strong>
            </div>
            <div className="total-row">
              <span>原価</span>
              <strong className="money">{formatYen(row.cost)}</strong>
            </div>
            <div className="total-row">
              <span>粗利</span>
              <strong className={`money ${profit < 0 ? "danger-text" : ""}`}>{formatYen(profit)}</strong>
            </div>
            <button className="btn quiet" type="button" onClick={() => navigate(`/jobs/${row.id}`)}>
              案件の原価を編集
            </button>
          </article>
        );
      })}
      {rows.length === 0 ? <Banner>案件がまだないので、集計はありません。</Banner> : null}
    </div>
  );
}
