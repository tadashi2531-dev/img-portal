import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FieldMic, useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { listCustomers } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa, formatYen, parseYen, todayISO } from "../lib/money.ts";
import {
  EXPENSE_CATEGORIES,
  INQUIRY_STATUSES,
  addInquiryExpense,
  addSiteSurvey,
  createEstimateForInquiry,
  createInquiry,
  listInquiries,
  listInquiryExpenses,
  listSiteSurveys,
  updateInquiryStatus,
  type InquiryExpense,
  type InquiryRow,
  type SiteSurvey,
} from "../lib/portalApi.ts";
import type { Customer } from "../lib/types.ts";

const SOURCES = ["電話", "LINE", "紹介", "メール", "ウェブ", "その他"];

const emptyForm = () => ({
  receivedOn: todayISO(),
  customerName: "",
  siteName: "",
  details: "",
  source: "電話",
  notes: "",
});

export function InquiriesPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [surveys, setSurveys] = useState<SiteSurvey[]>([]);
  const [expenses, setExpenses] = useState<InquiryExpense[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [survey, setSurvey] = useState({ visitOn: todayISO(), visitTime: "", attendees: "", notes: "" });
  const [expense, setExpense] = useState({ spentOn: todayISO(), category: "交通費", amount: "", notes: "" });
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const current = rows.find((row) => row.id === id) ?? null;

  useVoiceApply(({ transcript }) => {
    const heard = transcript.trim();
    if (!heard) return;
    if (id) {
      setSurvey((value) => ({ ...value, notes: heard }));
      setNotice("聞き取りを現地調査のメモに入れました。保存はしていません。");
      return;
    }
    setForm((value) => ({ ...value, details: heard }));
    setNotice("聞き取りを依頼内容に入れました。保存はしていません。");
  });

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [inquiryRows, customerRows] = await Promise.all([listInquiries(statusFilter || null), listCustomers()]);
      setRows(inquiryRows);
      setCustomers(customerRows);
      if (id) {
        const [surveyRows, expenseRows] = await Promise.all([listSiteSurveys(id), listInquiryExpenses(id)]);
        setSurveys(surveyRows);
        setExpenses(expenseRows);
      }
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [id, statusFilter]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ja");
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.customerName, row.siteName, row.details, row.source].join(" ").toLocaleLowerCase("ja").includes(needle),
    );
  }, [query, rows]);

  async function saveInquiry() {
    setError("");
    try {
      const created = await createInquiry(form);
      setForm(emptyForm());
      setNotice("案件を受付で保存しました。見積や送信はしていません。");
      navigate(`/inquiries/${created}`);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function saveSurvey() {
    if (!id) return;
    setError("");
    try {
      await addSiteSurvey({ inquiryId: id, ...survey });
      setSurvey({ visitOn: todayISO(), visitTime: "", attendees: "", notes: "" });
      setNotice("現地調査を追加しました。");
      await reload();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  async function saveExpense() {
    if (!id) return;
    const amount = parseYen(expense.amount);
    if (amount == null || amount < 0) {
      setError("金額は0以上の数値にしてください。");
      return;
    }
    setError("");
    try {
      await addInquiryExpense({ inquiryId: id, spentOn: expense.spentOn, category: expense.category, amount, notes: expense.notes });
      setExpense({ spentOn: todayISO(), category: "交通費", amount: "", notes: "" });
      setNotice("経費を追加しました。");
      await reload();
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  const expenseTotal = current?.expenseTotal ?? expenses.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>案件</h1>
          <p className="lead">受けた問い合わせをここに残します。見積を作り、受注にすると状態が受注になり、そのあと工程へ進めます。</p>
        </div>
        {id ? (
          <button className="btn quiet" type="button" onClick={() => navigate("/inquiries")}>
            一覧へ
          </button>
        ) : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      {id && current ? (
        <article className="card stack">
          <h2>{current.siteName}</h2>
          <p className="meta">
            受付日：{formatDateJa(current.receivedOn)}
            <br />
            得意先：{current.customerName || "未設定"}
            <br />
            経路：{current.source || "未設定"}
            {current.estimateNo ? (
              <>
                <br />
                見積：{current.estimateNo}
              </>
            ) : null}
          </p>
          <p>{current.details || "依頼内容は未記入です。"}</p>
          {current.notes ? <p className="fine">{current.notes}</p> : null}
          <label className="field">
            <span>状態</span>
            <select
              value={current.status}
              onChange={(event) =>
                void updateInquiryStatus(current.id, event.target.value)
                  .then(reload)
                  .catch((caught: unknown) => setError(toMessage(caught)))
              }
            >
              {INQUIRY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="total-row grand">
            <span>経費合計</span>
            <strong className="money">{formatYen(expenseTotal)}</strong>
          </div>
          <div className="row-actions">
            {current.estimateId ? (
              <button className="btn" type="button" onClick={() => navigate(`/estimates/${current.estimateId}`)}>
                見積を開く
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void createEstimateForInquiry(current)
                    .then((estimateId) => navigate(`/estimates/${estimateId}`))
                    .catch((caught: unknown) => setError(toMessage(caught)))
                }
              >
                見積を作る
              </button>
            )}
          </div>
        </article>
      ) : null}
      {id && current ? (
        <>
          <section className="card stack">
            <h2>現地調査</h2>
            {surveys.length === 0 ? <p className="fine">訪問はまだありません。</p> : null}
            {surveys.map((row) => (
              <p key={row.id} className="meta">
                {formatDateJa(row.visitOn)} {row.visitTime}
                {row.attendees ? ` ／ ${row.attendees}` : ""}
                <br />
                {row.notes || "メモなし"}
              </p>
            ))}
            <div className="grid-2">
              <label className="field">
                <span>日付</span>
                <input type="date" value={survey.visitOn} onChange={(event) => setSurvey({ ...survey, visitOn: event.target.value })} />
              </label>
              <label className="field">
                <span>時刻</span>
                <input type="time" value={survey.visitTime} onChange={(event) => setSurvey({ ...survey, visitTime: event.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>同行者</span>
              <input value={survey.attendees} onChange={(event) => setSurvey({ ...survey, attendees: event.target.value })} />
            </label>
            <FieldMic onApply={(attendees) => setSurvey((value) => ({ ...value, attendees }))} />
            <label className="field">
              <span>メモ</span>
              <textarea rows={2} value={survey.notes} onChange={(event) => setSurvey({ ...survey, notes: event.target.value })} />
            </label>
            <FieldMic onApply={(notes) => setSurvey((value) => ({ ...value, notes }))} />
            <button className="btn" type="button" onClick={() => void saveSurvey()}>
              調査を追加
            </button>
          </section>
          <section className="card stack">
            <h2>経費</h2>
            {expenses.length === 0 ? <p className="fine">経費はまだありません。</p> : null}
            {expenses.map((row) => (
              <p key={row.id} className="meta">
                {formatDateJa(row.spentOn)} {row.category} <strong className="money">{formatYen(row.amount)}</strong>
                <br />
                {row.notes || "メモなし"}
              </p>
            ))}
            <div className="grid-2">
              <label className="field">
                <span>日付</span>
                <input type="date" value={expense.spentOn} onChange={(event) => setExpense({ ...expense, spentOn: event.target.value })} />
              </label>
              <label className="field">
                <span>区分</span>
                <select value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })}>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>金額</span>
                <input inputMode="numeric" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>メモ</span>
              <input value={expense.notes} onChange={(event) => setExpense({ ...expense, notes: event.target.value })} />
            </label>
            <FieldMic onApply={(notes) => setExpense((value) => ({ ...value, notes }))} />
            <button className="btn" type="button" onClick={() => void saveExpense()}>
              経費を追加
            </button>
          </section>
        </>
      ) : (
        <>
          <section className="card stack">
            <div className="grid-2">
              <label className="field">
                <span>状態</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">すべて</option>
                  {INQUIRY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>検索</span>
                <input value={query} placeholder="得意先・現場名・内容" onChange={(event) => setQuery(event.target.value)} />
              </label>
            </div>
            <FieldMic onApply={(text) => setQuery(text.trim())} />
          </section>
          <form
            className="card stack"
            onSubmit={(event) => {
              event.preventDefault();
              void saveInquiry();
            }}
          >
            <h2>問い合わせを追加</h2>
            <label className="field">
              <span>受付日</span>
              <input type="date" value={form.receivedOn} onChange={(event) => setForm({ ...form, receivedOn: event.target.value })} />
            </label>
            <label className="field">
              <span>得意先</span>
              <input
                list="inquiry-customers"
                value={form.customerName}
                onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              />
              <datalist id="inquiry-customers">
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>
            </label>
            <FieldMic onApply={(customerName) => setForm((value) => ({ ...value, customerName }))} />
            <label className="field">
              <span>現場名 *</span>
              <input required value={form.siteName} onChange={(event) => setForm({ ...form, siteName: event.target.value })} />
            </label>
            <FieldMic onApply={(siteName) => setForm((value) => ({ ...value, siteName }))} />
            <label className="field">
              <span>依頼内容</span>
              <textarea rows={3} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} />
            </label>
            <FieldMic onApply={(details) => setForm((value) => ({ ...value, details }))} />
            <label className="field">
              <span>経路</span>
              <input list="inquiry-sources" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
              <datalist id="inquiry-sources">
                {SOURCES.map((source) => (
                  <option key={source} value={source} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>メモ</span>
              <textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <button className="btn" type="submit">
              受付として保存
            </button>
          </form>
          {loading ? <p className="fine">読み込み中…</p> : null}
          {!loading && filtered.length === 0 ? <Banner>案件はまだありません。</Banner> : null}
          {filtered.map((row) => (
            <article key={row.id} className="card stack">
              <div className="quote-top">
                <div>
                  <div className="quote-no">{row.status}</div>
                  <h2>{row.siteName}</h2>
                  <p className="meta">
                    受付日：{formatDateJa(row.receivedOn)}
                    <br />
                    得意先：{row.customerName || "未設定"}
                    <br />
                    経路：{row.source || "未設定"}
                    <br />
                    {row.details || "依頼内容なし"}
                  </p>
                </div>
                <div className="quote-side">
                  <span className="fine">経費合計</span>
                  <strong className="money">{formatYen(row.expenseTotal)}</strong>
                </div>
              </div>
              <button className="btn" type="button" onClick={() => navigate(`/inquiries/${row.id}`)}>
                開く
              </button>
            </article>
          ))}
        </>
      )}
      {id && !current && !loading ? <Banner tone="error">案件が見つかりません。</Banner> : null}
    </div>
  );
}
