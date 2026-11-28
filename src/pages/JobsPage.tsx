import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { Banner } from "../components/ui.tsx";
import { listCustomers } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa } from "../lib/money.ts";
import { createJob, listJobs } from "../lib/portalApi.ts";
import { PHASE_LABEL, type JobPhase } from "../lib/portalTypes.ts";
import type { Customer } from "../lib/types.ts";

export function JobsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listJobs>>>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [siteName, setSiteName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [jobRows, customerRows] = await Promise.all([listJobs(), listCustomers()]);
        setRows(jobRows);
        setCustomers(customerRows);
      } catch (caught) {
        setError(toMessage(caught));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function create() {
    setError("");
    try {
      const id = await createJob({ siteName, customerId: customerId || null });
      navigate(`/jobs/${id}`);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>工程・現場管理</h1>
        <p className="lead">現場名で現場を区別します。予定・実行・完了と、日別の工程（作業内容、塗料、担当、時間）を残します。住所から天気を取り、雨と強風は工程に出します。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h2>現場を追加</h2>
        <label className="field">
          <span>現場名 *</span>
          <input value={siteName} onChange={(event) => setSiteName(event.target.value)} required />
        </label>
        <label className="field">
          <span>得意先</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">未選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          追加して開く
        </button>
      </form>
      {loading ? <p className="fine">読み込み中…</p> : null}
      {!loading && rows.length === 0 ? <Banner>現場はまだありません。</Banner> : null}
      {rows.map((row) => (
        <article key={row.id} className="card">
          <FictionNote text={row.siteName || row.title} />
          <div className="quote-top">
            <div>
              <h2>{row.siteName || row.title || "現場名未設定"}</h2>
              <p className="meta">
                顧客：{row.customerName || "未設定"}
                <br />
                {formatDateJa(row.startDate)} 〜 {formatDateJa(row.endDate)}
              </p>
            </div>
            <div className="quote-side">
              <span className={`pill pill-${row.phase === "done" ? "accepted" : row.phase === "active" ? "sent" : "draft"}`}>
                {PHASE_LABEL[row.phase as JobPhase]}
              </span>
              <strong>{row.progress}%</strong>
            </div>
          </div>
          <button className="btn" type="button" onClick={() => navigate(`/jobs/${row.id}`)}>
            工程を開く
          </button>
        </article>
      ))}
    </div>
  );
}
