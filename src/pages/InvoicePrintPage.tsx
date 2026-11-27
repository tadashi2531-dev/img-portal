import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banner } from "../components/ui.tsx";
import { COMPANY_NAME, COMPANY_TRADE } from "../lib/config.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatPercentLabel, formatYen } from "../lib/money.ts";
import { getInvoice } from "../lib/portalApi.ts";
import type { InvoiceDetail } from "../lib/portalTypes.ts";

export function InvoicePrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getInvoice(id)
      .then((detail) => {
        setInvoice(detail);
        if (!detail) setError("請求が見つかりません。");
      })
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, [id]);

  if (!invoice) return error ? <Banner tone="error">{error}</Banner> : <p className="fine">読み込み中…</p>;
  const lines = invoice.lines.filter((line) => line.itemName.trim());

  return (
    <div className="stack">
      <div className="row-actions no-print">
        <button className="btn quiet" type="button" onClick={() => navigate(`/invoices/${invoice.id}`)}>
          編集へ戻る
        </button>
        <button className="btn" type="button" onClick={() => window.print()}>
          印刷 / PDFに保存
        </button>
      </div>
      <p className="fine no-print">この画面からメールは送信しません。</p>
      <article className="sheet">
        <h1 className="doc-title">御請求書</h1>
        <div className="doc-meta">
          <div>
            <p className="addressee">{invoice.customerName || "（得意先未設定）"} 御中</p>
            <p>下記の通りご請求申し上げます。</p>
          </div>
          <dl>
            <div>
              <dt>請求番号</dt>
              <dd>{invoice.invoiceNo}</dd>
            </div>
            <div>
              <dt>発行日</dt>
              <dd>{formatDateJa(invoice.issueDate)}</dd>
            </div>
            <div>
              <dt>支払期限</dt>
              <dd>{formatDateJa(invoice.dueOn)}</dd>
            </div>
          </dl>
        </div>
        <p className="doc-subject">
          <span>件名</span>
          {invoice.title || "未設定"}
        </p>
        <p className="doc-subject">
          <span>現場名</span>
          {invoice.siteName || "未設定"}
        </p>
        <p className="doc-total">
          <span>御請求金額（税込）</span>
          <strong>{formatYen(invoice.total)}</strong>
        </p>
        <div className="item-cards">
          {lines.map((line) => (
            <div key={line.key} className="item-card">
              <strong>{line.itemName}</strong>
              <span>{line.spec}</span>
              <span>
                {line.quantity}
                {line.unit} × {formatYen(Number(line.unitPrice) || 0)}
              </span>
              <strong>{formatYen((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}</strong>
            </div>
          ))}
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th>品名</th>
              <th>仕様</th>
              <th>数量</th>
              <th>単位</th>
              <th>単価</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>{line.itemName}</td>
                <td>{line.spec}</td>
                <td className="num">{line.quantity}</td>
                <td>{line.unit}</td>
                <td className="num">{formatYen(Number(line.unitPrice) || 0)}</td>
                <td className="num">{formatYen(Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="doc-sums">
          <div>
            <span>小計</span>
            <strong>{formatYen(invoice.subtotal)}</strong>
          </div>
          <div>
            <span>消費税（{formatPercentLabel(invoice.taxRate)}）</span>
            <strong>{formatYen(invoice.tax)}</strong>
          </div>
          <div className="grand">
            <span>合計（税込）</span>
            <strong>{formatYen(invoice.total)}</strong>
          </div>
        </div>
        <section className="doc-notes">
          <h2>備考</h2>
          <p>{invoice.notes || "特になし"}</p>
        </section>
        <footer className="issuer">
          <strong>{COMPANY_NAME}</strong>
          <span>{COMPANY_TRADE}</span>
        </footer>
      </article>
    </div>
  );
}
