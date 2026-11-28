import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeIntent, interpretSpeech, speechRecognitionCtor, speechSupported, type SpeechRecognitionLike, type VoiceIntent } from "../lib/speech.ts";

type ApplyHandler = (input: { transcript: string; intent: VoiceIntent }) => void;

type VoiceValue = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  intent: VoiceIntent | null;
  summary: string;
  start: () => void;
  apply: () => void;
  register: (handler: ApplyHandler) => () => void;
};

const VoiceContext = createContext<VoiceValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [supported] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [intent, setIntent] = useState<VoiceIntent | null>(null);
  const handler = useRef<ApplyHandler | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  function start() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    recognition.current?.stop();
    const next = new Ctor();
    next.lang = "ja-JP";
    next.continuous = false;
    next.interimResults = false;
    next.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(text);
      setIntent(interpretSpeech(text));
      setListening(false);
    };
    next.onerror = () => setListening(false);
    next.onend = () => setListening(false);
    recognition.current = next;
    setListening(true);
    next.start();
  }

  function apply() {
    if (!transcript || !intent) return;
    handler.current?.({ transcript, intent });
  }

  const value = useMemo<VoiceValue>(
    () => ({
      supported,
      listening,
      transcript,
      intent,
      summary: intent ? describeIntent(intent) : "",
      start,
      apply,
      register: (next) => {
        handler.current = next;
        return () => {
          if (handler.current === next) handler.current = null;
        };
      },
    }),
    [supported, listening, transcript, intent],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("音声入力はログイン後の画面だけで使えます。");
  return value;
}

export function useVoiceApply(onApply: ApplyHandler) {
  const { register } = useVoice();
  useEffect(() => register(onApply), [onApply, register]);
}

export function VoiceBar() {
  const voice = useVoice();
  return (
    <section className="voice-bar no-print">
      <div className="row-actions">
        <button type="button" className="btn" disabled={!voice.supported || voice.listening} onClick={voice.start}>
          {voice.listening ? "聞いています…" : "マイク"}
        </button>
        <button type="button" className="btn quiet" disabled={!voice.transcript} onClick={voice.apply}>
          画面に反映
        </button>
      </div>
      {voice.supported ? null : <p className="fine">このブラウザは音声入力に対応していません。iPhone の Safari では使えます。</p>}
      {voice.transcript ? <p className="meta">聞き取り: {voice.transcript}</p> : null}
      {voice.summary ? <p className="fine">{voice.summary} 反映しても保存や送信はしません。</p> : null}
    </section>
  );
}

export function FieldMic({ onApply }: { onApply: (text: string) => void }) {
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const supported = speechSupported();

  function start() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setHeard(event.results[0]?.[0]?.transcript ?? "");
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <div className="field-mic">
      <button type="button" className="btn quiet" disabled={!supported || listening} onClick={start}>
        {listening ? "聞いています…" : "この欄をマイクで"}
      </button>
      {!supported ? <p className="fine">このブラウザは音声入力に対応していません。</p> : null}
      {heard ? (
        <div className="row-actions">
          <span className="fine">聞き取り: {heard}</span>
          <button type="button" className="btn" onClick={() => onApply(heard)}>
            この欄に入れる
          </button>
        </div>
      ) : null}
    </div>
  );
}
