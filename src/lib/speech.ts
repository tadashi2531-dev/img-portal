export type VoiceIntent =
  | { kind: "estimate"; customerName: string; keyword: string }
  | { kind: "job_day"; date: string; content: string }
  | { kind: "text"; text: string };

type RecognitionCtor = new () => SpeechRecognitionLike;

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function speechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return speechRecognitionCtor() != null;
}

export function extractCompanyName(text: string): string {
  const patterns = [
    /([^\s、。]{1,40}株式会社)/,
    /(株式会社[^\s、。宛の]{1,40})/,
    /([^\s、。]{1,40}有限会社)/,
    /(有限会社[^\s、。宛の]{1,40})/,
    /([^\s、。]{1,40}合同会社)/,
    /(合同会社[^\s、。宛の]{1,40})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/宛$/, "");
  }
  const addressed = text.match(/(.+?)宛/);
  if (addressed?.[1]) return addressed[1].replace(/^[、。\s]+/, "").trim();
  return "";
}

export function interpretSpeech(text: string, today = new Date()): VoiceIntent {
  const raw = text.trim();
  if (!raw) return { kind: "text", text: "" };
  if (raw.includes("工程") && (raw.includes("追加") || raw.includes("入れ"))) {
    const content = raw
      .replace(/^.*工程に/, "")
      .replace(/(を追加して|を追加|追加して|追加|入れて|入れ).*$/, "")
      .trim();
    const date = new Date(today);
    if (raw.includes("明日")) date.setDate(date.getDate() + 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return { kind: "job_day", date: `${date.getFullYear()}-${month}-${day}`, content: content || raw };
  }
  if (raw.includes("見積")) {
    const customerName = extractCompanyName(raw);
    const keyword = raw
      .replace(customerName, " ")
      .replace(/宛に|宛の|宛|前の|以前の|前回の|見積を作って|の見積で|の見積|見積で|見積|を作って|作って|して/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { kind: "estimate", customerName, keyword };
  }
  return { kind: "text", text: raw };
}

export function describeIntent(intent: VoiceIntent): string {
  if (intent.kind === "estimate") {
    const customer = intent.customerName ? `宛先 ${intent.customerName}` : "宛先は未抽出";
    const keyword = intent.keyword ? `検索 ${intent.keyword}` : "検索語は未抽出";
    return `見積の流用: ${customer} / ${keyword}`;
  }
  if (intent.kind === "job_day") return `工程の追加: ${intent.date} ${intent.content}`;
  return "聞き取った文章を、開いている画面の欄に入れます。保存はしません。";
}
