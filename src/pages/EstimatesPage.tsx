import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusPill } from "../components/StatusPill.tsx";
import { Banner } from "../components/ui.tsx";
import { deleteEstimate, duplicateEstimate, listEstimates } from "../lib/api.ts";
import { createInvoiceFromEstimate, setReview } from "../lib/portalApi.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatYen } from "../lib/money.ts";
import { ESTIMATE_STATUSES, STATUS_LABEL, type EstimateListItem, type EstimateStatus } from "../lib/types.ts";

export function EstimatesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EstimateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EstimateStatus | "all">("all");
  const [busyId, setBusyId] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setRows(await listEstimates());
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ja");
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const haystack = [row.siteName, row.customerName, row.title, row.estimateNo].join(" ").toLocaleLowerCase("ja");
      return haystack.includes(needle);
    });
  }, [query, rows, status]);

  async function duplicate(row: EstimateListItem) {
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      const created = await duplicateEstimate(row.id);
      navigate(`/estimates/${created.id}`, { state: { duplicatedFrom: created.fromNo } });
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusyId("");
    }
  }

  async function remove(row: EstimateListItem) {
    if (!window.confirm(`見積 ${row.estimateNo} を削除しますか？明細も一緒に削除されます。この操作は取り消せません。`)) return;
    setBusyId(row.id);
    setError("");
    try {
      await deleteEstimate(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(`${row.estimateNo} を削除しました。`);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>見積</h1>
          <p className="lead">
            過去の見積りをベースに下書きを作り、品名・数量・単価は手で直せます。メールは下書きを確認し、送信ボタンを押したときだけ送ります。
          </p>
        </div>
        <button type="button" className="btn" onClick={() => navigate("/estimates/new")}>
          新規作成
        </button>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <div className="card">
        <div className="filters">
          <label className="field">
            <span>検索</span>
            <input
              type="search"
              value={query}
              placeholder="現場名・顧客・件名・見積番号"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field">
            <span>状態</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as EstimateStatus | "all")}>
              <option value="all">すべて</option>
              {ESTIMATE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row-actions">
          <button type="button" className="btn quiet" onClick={() => void reload()} disabled={loading}>
            再読み込み
          </button>
          <span className="fine">{loading ? "読み込み中…" : `${filtered.length}件`}</span>
        </div>
      </div>
      {!loading && filtered.length === 0 ? (
        <Banner>{rows.length === 0 ? "まだ見積がありません。新規作成から最初の下書きを作れます。" : "該当する見積はありません。"}</Banner>
      ) : null}
      {filtered.map((row) => (
        <article key={row.id} className="card quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-no">{row.estimateNo}</div>
              <h2>{row.title || "（件名なし）"}</h2>
              <p className="meta">
                現場名：{row.siteName || "未設定"}
                <br />
                顧客：{row.customerName || "未設定"}
                <br />
                発行日：{formatDateJa(row.issueDate)}
                <br />
                有効期限：{formatDateJa(row.validUntil)}
              </p>
            </div>
            <div className="quote-side">
              <StatusPill status={row.status} />
              <strong className="money">{formatYen(row.total)}</strong>
              <span className="fine">税込</span>
            </div>
          </div>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => navigate(`/estimates/${row.id}`)} disabled={busyId === row.id}>
              開いて編集
            </button>
            <button type="button" className="btn quiet" onClick={() => void duplicate(row)} disabled={busyId === row.id}>
              {busyId === row.id ? "処理中…" : "過去の見積りをベースに下書きを作る"}
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={busyId === row.id}
              onClick={() =>
                void createInvoiceFromEstimate(row.id)
                  .then((invoiceId) => navigate(`/invoices/${invoiceId}`))
                  .catch((caught: unknown) => setError(toMessage(caught)))
              }
            >
              請求の下書きを作る
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={busyId === row.id}
              onClick={() =>
                void setReview("estimates", row.id, !row.awaitingConfirmation)
                  .then(reload)
                  .then(() => setNotice(row.awaitingConfirmation ? "確認済みにしました。送信はしていません。" : "確認待ちにしました。送信はしていません。"))
                  .catch((caught: unknown) => setError(toMessage(caught)))
              }
            >
              {row.awaitingConfirmation ? "確認した（送らない）" : "確認待ちにする"}
            </button>
            <button type="button" className="btn danger" onClick={() => void remove(row)} disabled={busyId === row.id}>
              削除
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
