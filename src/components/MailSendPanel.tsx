import { useEffect, useState } from "react";
import { Banner } from "./ui.tsx";
import { bytesToBase64 } from "../lib/documentPdf.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa } from "../lib/money.ts";
import { listOutboundMessages, type OutboundMessage } from "../lib/portalApi.ts";
import { supabase } from "../lib/supabase.ts";

const STATUS_LABEL = { sent: "送信済み", failed: "失敗", not_configured: "送信設定がまだ" };

export function MailSendPanel({
  kind,
  refId,
  subject,
  body,
  makeAttachment,
}: {
  kind: "estimate" | "invoice" | "document";
  refId: string | undefined;
  subject: string;
  body: string;
  makeAttachment?: () => Promise<{ filename: string; bytes: Uint8Array } | null>;
}) {
  const [to, setTo] = useState("");
  const [history, setHistory] = useState<OutboundMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!refId) return;
    void listOutboundMessages(kind, refId)
      .then(setHistory)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, [kind, refId]);

  async function send() {
    if (!refId) {
      setError("先に保存してから送信してください。");
      return;
    }
    if (!window.confirm("表示中の下書きを、この宛先へ送信します。内容を確認しましたか？")) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      let attachment: { filename: string; contentBase64: string } | null = null;
      if (makeAttachment) {
        const file = await makeAttachment();
        if (file) attachment = { filename: file.filename, contentBase64: bytesToBase64(file.bytes) };
      }
      const { data, error: invokeError } = await supabase.functions.invoke("send-mail", {
        body: { kind, refId, to, subject, body, attachment },
      });
      if (invokeError) throw invokeError;
      const result = data as { ok?: boolean; code?: string; message?: string };
      if (result.code === "not_configured") {
        setNotice("送信設定がまだ。メールは送っていません。");
      } else if (result.ok) {
        setNotice("送信しました。");
      } else {
        setError(result.message || "送信できませんでした。");
      }
      setHistory(await listOutboundMessages(kind, refId));
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <p className="mail-warning">下書きを確認してから、送信ボタンを押したときだけ送ります。自動では送りません。</p>
      <label className="field">
        <span>宛先メール</span>
        <input type="email" inputMode="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@example.com" />
      </label>
      <button className="btn" type="button" disabled={sending || !refId || !to.trim()} onClick={() => void send()}>
        {sending ? "送信中…" : "送信"}
      </button>
      {!refId ? <p className="fine">先に保存すると送信できます。</p> : null}
      {notice ? <Banner tone={notice.includes("設定がまだ") ? "info" : "ok"}>{notice}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {history.length > 0 ? (
        <div className="stack">
          <h2>送信履歴</h2>
          {history.map((item) => (
            <p key={item.id} className="meta">
              {formatDateJa(item.createdAt.slice(0, 10))} {item.toEmail} ／ {STATUS_LABEL[item.status]}
              {item.hasAttachment ? " ／ PDF等を添付" : ""}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
