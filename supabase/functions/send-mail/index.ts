import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY = 20000;
const MAX_SUBJECT = 200;
const MAX_ATTACHMENT_CHARS = 6_000_000;

type Payload = {
  kind?: string;
  refId?: string | null;
  to?: string;
  subject?: string;
  body?: string;
  attachment?: { filename?: string; contentBase64?: string } | null;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "POST だけ受け付けます。" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, code: "not_configured", message: "送信設定がまだ" }, 500);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ ok: false, code: "unauthorized", message: "ログインが必要です。" }, 401);

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, message: "送信内容を読めませんでした。" }, 400);
  }

  const kind = payload.kind ?? "";
  const to = (payload.to ?? "").trim();
  const subject = (payload.subject ?? "").trim();
  const body = payload.body ?? "";
  const refId = payload.refId ?? null;
  if (kind !== "estimate" && kind !== "invoice" && kind !== "document") {
    return json({ ok: false, message: "送信の種類が正しくありません。" }, 400);
  }
  if (!isEmail(to) || !subject || !body.trim()) {
    return json({ ok: false, message: "宛先、件名、本文を確認してください。" }, 400);
  }
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) {
    return json({ ok: false, message: "件名または本文が長すぎます。" }, 400);
  }

  const attachment = payload.attachment?.contentBase64?.trim() ?? "";
  const filename = (payload.attachment?.filename ?? "document.pdf").replace(/[^\w.\-()（）\u3000-\u9fff]/g, "_");
  if (attachment.length > MAX_ATTACHMENT_CHARS) {
    return json({ ok: false, message: "添付ファイルが大きすぎます。" }, 400);
  }

  const record = {
    kind,
    ref_id: refId,
    to_email: to,
    subject,
    body,
    has_attachment: attachment.length > 0,
    sent_by: userData.user.id,
  };

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM") ?? "";
  if (!apiKey || !from) {
    await admin.from("outbound_messages").insert({ ...record, status: "not_configured", error: "RESEND_API_KEY または RESEND_FROM が未設定" });
    return json({ ok: false, code: "not_configured", message: "送信設定がまだ" });
  }

  const resendPayload: Record<string, unknown> = { from, to: [to], subject, text: body };
  if (attachment) {
    resendPayload.attachments = [{ filename, content: attachment }];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(resendPayload),
  });
  const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    const error = result.message || `送信サービスが ${response.status} を返しました。`;
    await admin.from("outbound_messages").insert({ ...record, status: "failed", error });
    return json({ ok: false, code: "failed", message: "送信できませんでした。履歴に残しています。" });
  }

  await admin.from("outbound_messages").insert({ ...record, status: "sent", provider_id: result.id ?? null });
  return json({ ok: true, code: "sent", message: "送信しました。" });
});
