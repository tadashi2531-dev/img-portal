import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatYen } from "../lib/money.ts";
import { createInvoiceFromEstimate, deleteInvoice, listEstimateChoices, listInvoices, saveInvoice, suggestInvoiceNo } from "../lib/portalApi.ts";
import { INVOICE_STATUS_LABEL } from "../lib/portalTypes.ts";
import { addDaysISO, todayISO } from "../lib/money.ts";

export function InvoicesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listInvoices>>>([]);
  const [choices, setChoices] = useState<{ id: string; label: string }[]>([]);
  const [estimateId, setEstimateId] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const [invoices, estimates] = await Promise.all([listInvoices(), listEstimateChoices()]);
    setRows(invoices);
    setChoices(estimates);
  }

  useEffect(() => {
    void reload().catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>請求発行</h1>
        <p className="lead">見積から請求の下書きを作ります。メールは下書きだけで、この画面からは送信しません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <section className="card stack">
        <label className="field">
          <span>見積から作る</span>
          <select value={estimateId} onChange={(event) => setEstimateId(event.target.value)}>
            <option value="">選択</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row-actions">
          <button
            className="btn"
            type="button"
            disabled={!estimateId}
            onClick={() =>
              void createInvoiceFromEstimate(estimateId)
                .then((id) => navigate(`/invoices/${id}`))
                .catch((caught: unknown) => setError(toMessage(caught)))
            }
          >
            見積から下書きを作る
          </button>
          <button
            className="btn quiet"
            type="button"
            onClick={() =>
              void suggestInvoiceNo()
                .then((invoiceNo) =>
                  saveInvoice({
                    invoiceNo,
                    estimateId: null,
                    jobId: null,
                    customerId: null,
                    siteName: "",
                    title: "",
                    issueDate: todayISO(),
                    dueOn: addDaysISO(todayISO(), 30),
                    status: "draft",
                    notes: "",
                    taxPercent: 10,
                    lines: [],
                  }),
                )
                .then((id) => navigate(`/invoices/${id}`))
                .catch((caught: unknown) => setError(toMessage(caught)))
            }
          >
            空の下書き
          </button>
        </div>
      </section>
      {rows.map((row) => (
        <article key={row.id} className="card">
          <FictionNote text={`${row.invoiceNo}${row.title}`} />
          <div className="quote-top">
            <div>
              <div className="quote-no">{row.invoiceNo}</div>
              <h2>{row.title || "（件名なし）"}</h2>
              <p className="meta">
                {row.customerName || "得意先未設定"}
                <br />
                現場名：{row.siteName || "未設定"}
                <br />
                発行日：{formatDateJa(row.issueDate)}
              </p>
            </div>
            <div className="quote-side">
              <span className="pill pill-draft">{INVOICE_STATUS_LABEL[row.status]}</span>
              {row.awaitingConfirmation ? <span className="pill pill-sent">確認待ち</span> : null}
              <strong className="money">{formatYen(row.total)}</strong>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => navigate(`/invoices/${row.id}`)}>
              開いて編集
            </button>
            <button className="btn quiet" type="button" onClick={() => navigate(`/invoices/${row.id}/print`)}>
              印刷
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                if (!window.confirm(`${row.invoiceNo} を削除しますか？`)) return;
                void deleteInvoice(row.id)
                  .then(reload)
                  .catch((caught: unknown) => setError(toMessage(caught)));
              }}
            >
              削除
            </button>
          </div>
        </article>
      ))}
      {rows.length === 0 ? <Banner>請求はまだありません。</Banner> : null}
    </div>
  );
}
