import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FieldMic, useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { listCustomers } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatYen } from "../lib/money.ts";
import { supabase } from "../lib/supabase.ts";
import type { Customer } from "../lib/types.ts";

type Candidate = {
  id: string;
  estimate_no: string;
  title: string | null;
  site_name: string | null;
  customer_name: string | null;
  issue_date: string | null;
  total: number | string | null;
  score: number;
};

export function EstimateReusePage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listCustomers()
      .then(setCustomers)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  useVoiceApply(({ intent, transcript }) => {
    if (intent.kind === "estimate") {
      if (intent.customerName) setCustomerName(intent.customerName);
      if (intent.keyword) setKeyword(intent.keyword);
      setNotice("聞き取りを検索欄と宛先欄に入れました。候補を見てから、下書きを作るボタンを押してください。");
      return;
    }
    setKeyword(transcript);
    setNotice("聞き取った文章を検索欄に入れました。保存はしていません。");
  });

  async function search() {
    setError("");
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("find_similar_estimates", { query: keyword });
    setBusy(false);
    if (rpcError) {
      setError(toMessage(rpcError));
      return;
    }
    const list = (data ?? []) as Candidate[];
    setRows(list);
    setSelected(list[0]?.id ?? "");
    if (list.length === 0) setNotice("近い見積はありません。言葉を変えて検索してください。");
  }

  async function createDraft() {
    const name = customerId ? customers.find((customer) => customer.id === customerId)?.name ?? "" : customerName.trim();
    if (!selected) {
      setError("元にする見積を選んでください。");
      return;
    }
    if (!name) {
      setError("宛先の会社を選ぶか、新しい会社名を入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("clone_estimate", { source_id: selected, customer_name: name });
    setBusy(false);
    if (rpcError || !data) {
      setError(toMessage(rpcError ?? new Error("下書きを作れませんでした。")));
      return;
    }
    navigate(`/estimates/${data as string}`);
  }

  return (
    <div className="stack">
      <div>
        <h1>過去の見積から作る</h1>
        <p className="lead">件名、現場、顧客、品目の言葉で近い見積を探します。選んで宛先を決めると、明細ごと下書きになります。送信はしません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack">
        <label className="field">
          <span>検索</span>
          <input value={keyword} placeholder="例: マンション 外壁塗装" onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <FieldMic onApply={setKeyword} />
        <button className="btn" type="button" disabled={busy} onClick={() => void search()}>
          {busy ? "検索中…" : "近い見積を探す"}
        </button>
      </section>
      {rows.map((row) => (
        <label key={row.id} className="card quote-card">
          <div className="quote-top">
            <div>
              <div className="quote-no">{row.estimate_no}</div>
              <h2>{row.title || "（件名なし）"}</h2>
              <p className="meta">
                顧客：{row.customer_name || "未設定"}
                <br />
                現場名：{row.site_name || "未設定"}
                <br />
                {formatDateJa(row.issue_date)} ／ 近さ {row.score}
              </p>
            </div>
            <div className="quote-side">
              <strong className="money">{formatYen(Number(row.total) || 0)}</strong>
              <input type="radio" name="source" checked={selected === row.id} onChange={() => setSelected(row.id)} />
            </div>
          </div>
        </label>
      ))}
      <section className="card stack">
        <h2>宛先</h2>
        <label className="field">
          <span>登録済みの得意先</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              if (event.target.value) setCustomerName("");
            }}
          >
            <option value="">選ばない</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>新しい会社名</span>
          <input
            value={customerName}
            placeholder="株式会社山田建設"
            onChange={(event) => {
              setCustomerName(event.target.value);
              if (event.target.value.trim()) setCustomerId("");
            }}
          />
        </label>
        <FieldMic
          onApply={(text) => {
            setCustomerName(text);
            setCustomerId("");
          }}
        />
        <button className="btn" type="button" disabled={busy || !selected} onClick={() => void createDraft()}>
          この見積で下書きを作る
        </button>
        <p className="fine">発行日は今日、有効期限は30日後、状態は下書きです。自動では保存しません。このボタンを押したときだけ作ります。</p>
      </section>
    </div>
  );
}
