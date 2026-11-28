import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { speechRecognitionCtor, speechSupported, type SpeechRecognitionLike } from "../lib/speech.ts";
import { listAiInbox, sendAiInbox, type AiInboxItem, type AiLink } from "../lib/portalApi.ts";

function linkHref(link: AiLink): string {
  const id = link.id;
  const section = link.section;
  if (section === "inquiry" || section === "案件") return `/inquiries/${id}`;
  if (section === "estimate" || section === "見積") return `/estimates/${id}`;
  if (section === "order" || section === "受注") return "/orders";
  if (section === "job" || section === "工程") return `/jobs/${id}`;
  if (section === "invoice" || section === "請求") return `/invoices/${id}`;
  if (section === "trip" || section === "出張") return `/trips/${id}`;
  if (section === "document" || section === "書類") return "/documents";
  if (section === "customer" || section === "得意先") return "/customers";
  return "";
}

export function AiTalkPage() {
  const supported = speechSupported();
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [rows, setRows] = useState<AiInboxItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  useVoiceApply(({ transcript }) => {
    const heard = transcript.trim();
    if (!heard) return;
    setDraft((current) => (current.trim() ? `${current.trim()}\n${heard}` : heard));
    setNotice("聞き取りを文章に入れました。AIに送るまでは保存しません。");
  });

  async function reload() {
    try {
      setRows(await listAiInbox());
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  function listen() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition: SpeechRecognitionLike = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (heard) setDraft((current) => (current.trim() ? `${current.trim()}\n${heard}` : heard));
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function send() {
    const text = draft.trim();
    if (!text) {
      setError("話した内容か、入力した文章を入れてください。");
      return;
    }
    setSending(true);
    setError("");
    try {
      await sendAiInbox(text);
      setDraft("");
      setNotice("受け付けました。AIが各欄の下書きへ振り分けます。メールは送りません。");
      await reload();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>AIに話す</h1>
        <p className="lead">話した内容を確認してから送ります。AIが案件や見積などの下書きに振り分けます。自動では保存も送信もしません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack ai-talk">
        <button type="button" className="mic-hero" disabled={!supported || listening} onClick={listen}>
          {listening ? "聞いています" : "マイク"}
        </button>
        {supported ? <p className="fine">話した文章は下に出ます。直してから「AIに送る」を押してください。</p> : <p className="fine">このブラウザは音声入力に対応していません。文章は入力できます。iPhone の Safari ではマイクが使えます。</p>}
        <label className="field">
          <span>話した内容</span>
          <textarea rows={5} value={draft} placeholder="ここに話すか、入力します" onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button className="btn" type="button" disabled={sending || !draft.trim()} onClick={() => void send()}>
          {sending ? "送信中…" : "AIに送る"}
        </button>
      </section>
      <section className="stack">
        <h2>履歴</h2>
        <p className="fine">新しい順です。30秒ごとに更新します。</p>
        {rows.length === 0 ? <p className="fine">まだありません。</p> : null}
        {rows.map((row) => (
          <article key={row.id} className="card stack">
            <div className="quote-top">
              <strong>{row.text}</strong>
              <span className={`pill ${row.status === "処理済" ? "pill-accepted" : row.status === "要確認" ? "pill-lost" : "pill-sent"}`}>{row.status}</span>
            </div>
            {row.resultSummary ? <p>{row.resultSummary}</p> : <p className="fine">結果はまだありません。</p>}
            {row.resultLinks.length > 0 ? (
              <div className="row-actions">
                {row.resultLinks.map((link) => {
                  const href = linkHref(link);
                  const label = link.label || link.section;
                  return href ? (
                    <Link key={`${link.section}-${link.id}-${label}`} className="btn quiet" to={href}>
                      {label}
                    </Link>
                  ) : (
                    <span key={`${link.section}-${link.id}-${label}`} className="fine">
                      {label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
