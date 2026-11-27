import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { SalesChart } from "../components/SalesChart.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { formatYen, todayISO } from "../lib/money.ts";
import { salesPoints, salesRows, type SalesPoint } from "../lib/portalApi.ts";

export function SalesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof salesRows>>>([]);
  const [points, setPoints] = useState<SalesPoint[]>([]);
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([salesRows(), salesPoints()])
      .then(([jobRows, dated]) => {
        setRows(jobRows);
        setPoints(dated);
      })
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
      <section className="card stack">
        <h2>期間別</h2>
        <div className="segment">
          {(["day", "week", "month"] as const).map((value) => (
            <button key={value} type="button" className={period === value ? "on" : ""} onClick={() => setPeriod(value)}>
              {value === "day" ? "日" : value === "week" ? "週" : "月"}
            </button>
          ))}
        </div>
        <p className="fine">黄が売上、灰が原価、緑が粗利です。</p>
        <SalesChart buckets={groupPoints(points, period)} />
      </section>
      <section className="card stack">
        <h2>案件別</h2>
        <SalesChart
          buckets={rows.map((row) => ({
            label: row.title.replace("架空）", "").slice(0, 8) || "案件",
            revenue: row.revenue,
            cost: row.cost,
            profit: row.revenue - row.cost,
          }))}
        />
      </section>
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

function groupPoints(points: SalesPoint[], period: "day" | "week" | "month"): { label: string; revenue: number; cost: number; profit: number }[] {
  const buckets = new Map<string, { revenue: number; cost: number }>();
  for (const point of points) {
    const key = periodKey(point.date, period);
    const current = buckets.get(key) ?? { revenue: 0, cost: 0 };
    current.revenue += point.revenue;
    current.cost += point.cost;
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      label: period === "month" ? key.slice(5) : key.slice(5),
      revenue: value.revenue,
      cost: value.cost,
      profit: value.revenue - value.cost,
    }));
}

function periodKey(date: string, period: "day" | "week" | "month"): string {
  if (period === "month") return date.slice(0, 7);
  if (period === "day") return date;
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year || 1970, (month || 1) - 1, day || 1);
  const diff = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - diff);
  return todayISO(value);
}
