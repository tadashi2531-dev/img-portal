import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { primaryEmail, useCompany } from "../components/CompanyContext.tsx";
import { FictionNote } from "../components/FictionNote.tsx";
import { MailSendPanel } from "../components/MailSendPanel.tsx";
import { Banner } from "../components/ui.tsx";
import { renderDocumentPdf } from "../lib/documentPdf.ts";
import { listCustomers } from "../lib/api.ts";
import { buildInvoiceEmail } from "../lib/emailDraft.ts";
import { toMessage } from "../lib/errors.ts";
import { formatYen, isDiscount, lineAmount, parseDecimal, parsePercent, parseYen, percentToRate, rateToPercentInput, summarize } from "../lib/money.ts";
import { getInvoice, listJobs, saveInvoice, setReview } from "../lib/portalApi.ts";
import { INVOICE_STATUSES, INVOICE_STATUS_LABEL, type InvoiceDetail, type InvoiceLine, type InvoiceStatus } from "../lib/portalTypes.ts";
import { UNIT_SUGGESTIONS, type Customer } from "../lib/types.ts";

export function InvoiceEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { settings } = useCompany();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [taxPercent, setTaxPercent] = useState("10");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    void Promise.all([getInvoice(id), listCustomers(), listJobs()])
      .then(([detail, customerRows, jobRows]) => {
        setInvoice(detail);
        setCustomers(customerRows);
        setJobs(jobRows);
        if (detail) setTaxPercent(rateToPercentInput(detail.taxRate || 0.1));
        if (!detail) setError("請求が見つかりません。");
      })
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, [id]);

  const preview = useMemo(() => {
    const percent = parsePercent(taxPercent);
    const rate = percent == null ? 0.1 : percentToRate(percent);
    const lines = (invoice?.lines ?? [])
      .filter((line) => line.itemName.trim())
      .map((line) => ({
        quantity: parseDecimal(line.quantity) ?? 0,
        unitPrice: parseYen(line.unitPrice) ?? 0,
        itemName: line.itemName.trim(),
        spec: line.spec.trim(),
        unit: line.unit.trim(),
        id: line.id,
      }));
    return { percent, totals: summarize(lines, rate), lines };
  }, [invoice?.lines, taxPercent]);

  if (!invoice) return error ? <Banner tone="error">{error}</Banner> : <p className="fine">読み込み中…</p>;

  function patch(partial: Partial<InvoiceDetail>) {
    setInvoice((current) => (current ? { ...current, ...partial } : current));
  }

  function patchLine(key: string, partial: Partial<InvoiceLine>) {
    if (!invoice) return;
    patch({ lines: invoice.lines.map((line) => (line.key === key ? { ...line, ...partial } : line)) });
  }

  function addLine(discount: boolean) {
    if (!invoice) return;
    patch({
      lines: [
        ...invoice.lines,
        discount
          ? { key: crypto.randomUUID(), itemName: "値引き", spec: "", quantity: "1", unit: "式", unitPrice: "-" }
          : { key: crypto.randomUUID(), itemName: "", spec: "", quantity: "1", unit: "㎡", unitPrice: "0" },
      ],
    });
  }

  const customerName = customers.find((customer) => customer.id === invoice.customerId)?.name ?? invoice.customerName;
  const mail = buildInvoiceEmail({
    invoiceNo: invoice.invoiceNo,
    customerName,
    siteName: invoice.siteName,
    title: invoice.title,
    issueDate: invoice.issueDate,
    dueOn: invoice.dueOn,
    notes: invoice.notes,
    lines: preview.lines.map((line) => ({
      itemName: line.itemName,
      spec: line.spec,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      amount: lineAmount(line.quantity, line.unitPrice),
    })),
    subtotal: preview.totals.subtotal,
    taxRate: preview.percent == null ? invoice.taxRate : percentToRate(preview.percent),
    tax: preview.totals.tax,
    total: preview.totals.total,
    companyName: settings.companyName,
    trade: settings.trade,
    email: primaryEmail(settings),
  });

  async function save() {
    if (!invoice) return;
    if (preview.percent == null) {
      setError("消費税率は0から100までにしてください。");
      return;
    }
    const invalid = invoice.lines.find((line) => {
      if (!line.itemName.trim()) return false;
      const quantity = parseDecimal(line.quantity);
      return quantity == null || quantity < 0 || parseYen(line.unitPrice) == null;
    });
    if (invalid) {
      setError(`「${invalid.itemName.trim()}」の数量は0以上、単価は数値にしてください。値引きは単価をマイナスにします。`);
      return;
    }
    try {
      await saveInvoice({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        estimateId: invoice.estimateId,
        jobId: invoice.jobId,
        customerId: invoice.customerId,
        siteName: invoice.siteName,
        title: invoice.title,
        issueDate: invoice.issueDate ?? "",
        dueOn: invoice.dueOn ?? "",
        status: invoice.status,
        notes: invoice.notes,
        taxPercent: preview.percent,
        lines: preview.lines,
      });
      const fresh = await getInvoice(invoice.id);
      if (fresh) setInvoice(fresh);
      setNotice("保存しました。");
      setError("");
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  return (
    <div className="stack">
      <button className="btn quiet" type="button" onClick={() => navigate("/invoices")}>
        請求一覧へ
      </button>
      <FictionNote text={`${invoice.invoiceNo}${invoice.title}`} />
      <h1>請求を編集</h1>
      <p className="fine">メールは下書きを開いて確認し、送信ボタンを押したときだけ送ります。</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack">
        <div className="grid-2">
          <label className="field">
            <span>請求番号 *</span>
            <input value={invoice.invoiceNo} onChange={(event) => patch({ invoiceNo: event.target.value })} />
          </label>
          <label className="field">
            <span>状態</span>
            <select value={invoice.status} onChange={(event) => patch({ status: event.target.value as InvoiceStatus })}>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INVOICE_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>得意先</span>
            <select value={invoice.customerId ?? ""} onChange={(event) => patch({ customerId: event.target.value || null })}>
              <option value="">未選択</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>案件</span>
            <select value={invoice.jobId ?? ""} onChange={(event) => patch({ jobId: event.target.value || null })}>
              <option value="">未選択</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>件名</span>
            <input value={invoice.title} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="field">
            <span>現場名</span>
            <input value={invoice.siteName} onChange={(event) => patch({ siteName: event.target.value })} />
          </label>
          <label className="field">
            <span>発行日</span>
            <input type="date" value={invoice.issueDate ?? ""} onChange={(event) => patch({ issueDate: event.target.value || null })} />
          </label>
          <label className="field">
            <span>支払期限</span>
            <input type="date" value={invoice.dueOn ?? ""} onChange={(event) => patch({ dueOn: event.target.value || null })} />
          </label>
        </div>
        <label className="field">
          <span>備考</span>
          <textarea rows={3} value={invoice.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </label>
      </section>
      <section className="card stack">
        <h2>明細</h2>
        <datalist id="invoice-units">
          {UNIT_SUGGESTIONS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
        {invoice.lines.map((line) => {
          const quantity = parseDecimal(line.quantity);
          const price = parseYen(line.unitPrice);
          return (
            <div key={line.key} className="line-card grid-2">
              <label className="field">
                <span>品名</span>
                <input value={line.itemName} onChange={(event) => patchLine(line.key, { itemName: event.target.value })} />
              </label>
              <label className="field">
                <span>仕様</span>
                <input value={line.spec} onChange={(event) => patchLine(line.key, { spec: event.target.value })} />
              </label>
              <label className="field">
                <span>数量</span>
                <input inputMode="decimal" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} />
              </label>
              <label className="field">
                <span>単位</span>
                <input list="invoice-units" value={line.unit} onChange={(event) => patchLine(line.key, { unit: event.target.value })} />
              </label>
              <label className="field">
                <span>単価</span>
                <input
                  inputMode="text"
                  placeholder="値引きは -1000"
                  value={line.unitPrice}
                  onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })}
                />
              </label>
              <div className="field">
                <span>金額</span>
                <strong className={`money${quantity != null && price != null && isDiscount(lineAmount(quantity, price)) ? " discount" : ""}`}>
                  {quantity == null || price == null ? "—" : formatYen(lineAmount(quantity, price))}
                </strong>
              </div>
              <button className="btn danger" type="button" onClick={() => patch({ lines: invoice.lines.filter((item) => item.key !== line.key) })}>
                行を削除
              </button>
            </div>
          );
        })}
        <p className="fine">金額は数量×単価です。値引きと端数調整は、単価をマイナスにしてください。</p>
        <div className="row-actions">
          <button className="btn quiet" type="button" onClick={() => addLine(false)}>
            行を追加
          </button>
          <button className="btn quiet" type="button" onClick={() => addLine(true)}>
            値引き行を追加
          </button>
        </div>
      </section>
      <section className="card totals">
        <div className="total-row">
          <span>小計</span>
          <strong className={`money${isDiscount(preview.totals.subtotal) ? " discount" : ""}`}>{formatYen(preview.totals.subtotal)}</strong>
        </div>
        <label className="total-row">
          <span>消費税率（%）</span>
          <input className="tax-input" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} />
        </label>
        <div className="total-row">
          <span>消費税</span>
          <strong className={`money${isDiscount(preview.totals.tax) ? " discount" : ""}`}>{formatYen(preview.totals.tax)}</strong>
        </div>
        <div className="total-row grand">
          <span>合計（税込）</span>
          <strong className={`money${isDiscount(preview.totals.total) ? " discount" : ""}`}>{formatYen(preview.totals.total)}</strong>
        </div>
      </section>
      <div className="row-actions">
        <button className="btn" type="button" onClick={() => void save()}>
          保存する
        </button>
        <button className="btn quiet" type="button" onClick={() => navigate(`/invoices/${invoice.id}/print`)}>
          印刷 / PDF
        </button>
        <button className="btn quiet" type="button" onClick={() => setMailOpen(true)}>
          メール下書きを作る
        </button>
        <button
          className="btn quiet"
          type="button"
          onClick={() =>
            void setReview("invoices", invoice.id, !invoice.awaitingConfirmation).then(() => {
              patch({ awaitingConfirmation: !invoice.awaitingConfirmation });
              setNotice(invoice.awaitingConfirmation ? "確認済みにしました。送信はしていません。" : "確認待ちにしました。送信はしていません。");
            })
          }
        >
          {invoice.awaitingConfirmation ? "確認した（送らない）" : "確認待ちにする"}
        </button>
      </div>
      {mailOpen ? (
        <section className="card mail-card stack">
          <h2>メール下書き</h2>
          <label className="field">
            <span>件名</span>
            <input readOnly value={mail.subject} />
          </label>
          <label className="field">
            <span>本文</span>
            <textarea readOnly rows={14} value={mail.body} />
          </label>
          <MailSendPanel
            kind="invoice"
            refId={invoice.id}
            subject={mail.subject}
            body={mail.body}
            makeAttachment={() =>
              renderDocumentPdf({
                heading: "御請求書",
                numberLabel: "請求番号",
                number: invoice.invoiceNo,
                customer: customerName,
                title: invoice.title,
                site: invoice.siteName,
                dateLabel: "発行日",
                date: invoice.issueDate ?? "",
                lines: preview.lines.map((line) => ({
                  name: line.itemName,
                  spec: line.spec,
                  qty: String(line.quantity),
                  unit: line.unit,
                  price: formatYen(line.unitPrice),
                  amount: formatYen(lineAmount(line.quantity, line.unitPrice)),
                })),
                subtotal: formatYen(preview.totals.subtotal),
                tax: formatYen(preview.totals.tax),
                total: formatYen(preview.totals.total),
                notes: invoice.notes,
                issuer: `${settings.companyName}　${settings.trade}`,
              }).then((bytes) => ({ filename: `${invoice.invoiceNo || "invoice"}.pdf`, bytes }))
            }
          />
          <button
            className="btn"
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(`件名：${mail.subject}\n\n${mail.body}`).then(
                () => setCopied("件名と本文をコピーしました。"),
                () => setCopied("コピーできませんでした。文章を選択してください。"),
              )
            }
          >
            件名と本文をコピー
          </button>
          {copied ? <Banner tone="ok">{copied}</Banner> : null}
        </section>
      ) : null}
    </div>
  );
}
