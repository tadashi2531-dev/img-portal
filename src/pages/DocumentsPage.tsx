import { useEffect, useState } from "react";
import { primaryEmail, useCompany } from "../components/CompanyContext.tsx";
import { FictionNote } from "../components/FictionNote.tsx";
import { MailSendPanel } from "../components/MailSendPanel.tsx";
import { Banner } from "../components/ui.tsx";
import { listCustomers } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa } from "../lib/money.ts";
import { deleteDocument, documentSignedUrl, listDocuments, listJobs, saveDocument, setReview, uploadDocumentFile } from "../lib/portalApi.ts";
import { DOC_KINDS, DOC_STATUS_LABEL, DOC_STATUSES, type DocKind, type DocStatus, type DocumentRow } from "../lib/portalTypes.ts";
import type { Customer } from "../lib/types.ts";

const EMPTY = { id: "", customerId: "", jobId: "", title: "", docKind: "契約書" as DocKind, status: "missing" as DocStatus, dueOn: "", notes: "" };

export function DocumentsPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { settings } = useCompany();

  async function reload() {
    const [documents, customerRows, jobRows] = await Promise.all([listDocuments(), listCustomers(), listJobs()]);
    setRows(documents);
    setCustomers(customerRows);
    setJobs(jobRows);
  }

  useEffect(() => {
    void reload().catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>契約・書類</h1>
        <p className="lead">注文書、契約書、入館申請などの状態を見ます。ファイルは社内だけの非公開置き場です。外には送りません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDocument({
            id: form.id || undefined,
            customerId: form.customerId || null,
            jobId: form.jobId || null,
            title: form.title,
            docKind: form.docKind,
            status: form.status,
            dueOn: form.dueOn,
            notes: form.notes,
          })
            .then(() => {
              setForm(EMPTY);
              setNotice("保存しました。");
              return reload();
            })
            .catch((caught: unknown) => setError(toMessage(caught)));
        }}
      >
        <h2>{form.id ? "書類を編集" : "書類を追加"}</h2>
        <label className="field">
          <span>書類名 *</span>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>種類</span>
            <select value={form.docKind} onChange={(event) => setForm({ ...form, docKind: event.target.value as DocKind })}>
              {DOC_KINDS.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>状態</span>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DocStatus })}>
              {DOC_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {DOC_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>期限</span>
            <input type="date" value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} />
          </label>
          <label className="field">
            <span>得意先</span>
            <select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">未選択</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>現場</span>
            <select value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}>
              <option value="">未選択</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>備考</span>
          <textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        {form.id ? (
          <MailSendPanel
            kind="document"
            refId={form.id}
            subject={`書類のご送付（${form.title || "書類"}）`}
            body={[
              `${form.title}`,
              `種類：${form.docKind}`,
              `期限：${form.dueOn || "未設定"}`,
              form.notes || "",
              "",
              settings.companyName,
              primaryEmail(settings),
            ]
              .filter((line, index, lines) => index < lines.length - 1 || line !== "")
              .join("\n")}
          />
        ) : (
          <p className="fine">保存した書類から、下書きを確認して送信できます。</p>
        )}
        <div className="row-actions">
          <button className="btn" type="submit">
            {form.id ? "更新する" : "追加する"}
          </button>
          {form.id ? (
            <button className="btn quiet" type="button" onClick={() => setForm(EMPTY)}>
              キャンセル
            </button>
          ) : null}
        </div>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <FictionNote text={row.title} />
          <div className="quote-top">
            <div>
              <h2>{row.title}</h2>
              <p className="meta">
                {row.docKind} ／ {row.customerName || "得意先未設定"} ／ {row.jobTitle || "案件未設定"}
                <br />
                期限：{formatDateJa(row.dueOn)}
              </p>
            </div>
            <span className={`pill ${row.status === "active" ? "pill-accepted" : row.status === "missing" ? "pill-lost" : "pill-sent"}`}>
              {DOC_STATUS_LABEL[row.status]}
            </span>
          </div>
          <div className="row-actions">
            <button className="btn quiet" type="button" onClick={() => setForm({ id: row.id, customerId: row.customerId ?? "", jobId: row.jobId ?? "", title: row.title, docKind: row.docKind, status: row.status, dueOn: row.dueOn ?? "", notes: row.notes })}>
              編集
            </button>
            <label className="btn quiet">
              ファイルを付ける
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    setError("ファイルは10MBまでです。");
                    return;
                  }
                  void uploadDocumentFile(row.id, file)
                    .then(() => {
                      setNotice("ファイルを保存しました。社外には送っていません。");
                      return reload();
                    })
                    .catch((caught: unknown) => setError(toMessage(caught)));
                }}
              />
            </label>
            {row.storagePath ? (
              <button className="btn quiet" type="button" onClick={() => void documentSignedUrl(row.storagePath).then((url) => window.open(url, "_blank", "noopener"))}>
                開く
              </button>
            ) : null}
            <button
              className="btn quiet"
              type="button"
              onClick={() =>
                void setReview("documents", row.id, !row.awaitingConfirmation)
                  .then(reload)
                  .then(() => setNotice(row.awaitingConfirmation ? "確認済みにしました。送信はしていません。" : "確認待ちにしました。送信はしていません。"))
              }
            >
              {row.awaitingConfirmation ? "確認した（送らない）" : "確認待ちにする"}
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                if (!window.confirm(`「${row.title}」を削除しますか？`)) return;
                void deleteDocument(row)
                  .then(reload)
                  .catch((caught: unknown) => setError(toMessage(caught)));
              }}
            >
              削除
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
