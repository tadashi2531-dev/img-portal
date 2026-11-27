import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banner } from "../components/ui.tsx";
import { getEstimate } from "../lib/api.ts";
import { COMPANY_NAME, COMPANY_TRADE } from "../lib/config.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatPercentLabel, formatYen } from "../lib/money.ts";
import type { EstimateDetail } from "../lib/types.ts";

export function EstimatePrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [estimate, setEstimate] = useState<EstimateDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const detail = await getEstimate(id);
        if (!active) return;
        if (!detail) setError("見積が見つかりません。");
        setEstimate(detail);
      } catch (caught) {
        if (active) setError(toMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <p className="fine">読み込み中…</p>;
  if (error || !estimate) return <Banner tone="error">{error || "見積が見つかりません。"}</Banner>;

  return (
    <div className="stack">
      <div className="row-actions no-print">
        <button type="button" className="btn quiet" onClick={() => navigate(`/estimates/${estimate.id}`)}>
          編集へ戻る
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          印刷 / PDFに保存
        </button>
      </div>
      <p className="fine no-print">ブラウザの印刷で「PDFに保存」を選べます。メールは編集画面の下書きから送ります。</p>
      <article className="sheet">
        <h1 className="doc-title">御見積書</h1>
        <div className="doc-meta">
          <div>
            <p className="addressee">{estimate.customerName || "（得意先未設定）"} 御中</p>
            <p>下記の通りお見積り申し上げます。</p>
          </div>
          <dl>
            <div>
              <dt>見積番号</dt>
              <dd>{estimate.estimateNo}</dd>
            </div>
            <div>
              <dt>発行日</dt>
              <dd>{formatDateJa(estimate.issueDate)}</dd>
            </div>
            <div>
              <dt>有効期限</dt>
              <dd>{formatDateJa(estimate.validUntil)}</dd>
            </div>
          </dl>
        </div>
        <p className="doc-subject">
          <span>件名</span>
          {estimate.title || "未設定"}
        </p>
        <p className="doc-subject">
          <span>現場名</span>
          {estimate.siteName || "未設定"}
        </p>
        <p className="doc-total">
          <span>御見積金額（税込）</span>
          <strong>{formatYen(estimate.total)}</strong>
        </p>
        <div className="item-cards">
          {estimate.items.length === 0 ? <p>明細はありません。</p> : null}
          {estimate.items.map((item) => (
            <div key={item.id} className="item-card">
              <strong>{item.itemName}</strong>
              <span>{item.spec || "仕様なし"}</span>
              <span>
                {item.quantity}
                {item.unit} × {formatYen(item.unitPrice)}
              </span>
              <strong className="num">{formatYen(item.amount)}</strong>
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
            {estimate.items.map((item) => (
              <tr key={item.id}>
                <td>{item.itemName}</td>
                <td>{item.spec}</td>
                <td className="num">{item.quantity}</td>
                <td>{item.unit}</td>
                <td className="num">{formatYen(item.unitPrice)}</td>
                <td className="num">{formatYen(item.amount)}</td>
              </tr>
            ))}
            {estimate.items.length === 0 ? (
              <tr>
                <td colSpan={6}>明細はありません。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="doc-sums">
          <div>
            <span>小計</span>
            <strong>{formatYen(estimate.subtotal)}</strong>
          </div>
          <div>
            <span>消費税（{formatPercentLabel(estimate.taxRate)}）</span>
            <strong>{formatYen(estimate.tax)}</strong>
          </div>
          <div className="grand">
            <span>合計（税込）</span>
            <strong>{formatYen(estimate.total)}</strong>
          </div>
        </div>
        <section className="doc-notes">
          <h2>備考</h2>
          <p>{estimate.notes || "特になし"}</p>
        </section>
        <footer className="issuer">
          <strong>{COMPANY_NAME}</strong>
          <span>{COMPANY_TRADE}</span>
        </footer>
      </article>
    </div>
  );
}
