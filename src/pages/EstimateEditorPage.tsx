import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { StatusPill } from "../components/StatusPill.tsx";
import { primaryEmail, useCompany } from "../components/CompanyContext.tsx";
import { MailSendPanel } from "../components/MailSendPanel.tsx";
import { FieldMic, useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner, HazardStripe, SelectField, TextArea, TextField } from "../components/ui.tsx";
import { renderDocumentPdf } from "../lib/documentPdf.ts";
import { useUnsaved } from "../components/unsaved.tsx";
import { duplicateEstimate, getEstimate, listCustomers, saveEstimate, suggestEstimateNo, type EstimateLineInput } from "../lib/api.ts";
import { markEstimateOrdered } from "../lib/portalApi.ts";
import { buildEstimateEmail } from "../lib/emailDraft.ts";
import { toMessage } from "../lib/errors.ts";
import {
  addDaysISO,
  formatYen,
  isDiscount,
  lineAmount,
  parseDecimal,
  parsePercent,
  parseYen,
  percentToRate,
  rateToPercentInput,
  summarize,
  todayISO,
} from "../lib/money.ts";
import {
  ESTIMATE_STATUSES,
  STATUS_LABEL,
  UNIT_SUGGESTIONS,
  type Customer,
  type EstimateDetail,
  type EstimateStatus,
} from "../lib/types.ts";

type LineForm = {
  key: string;
  id?: string;
  itemName: string;
  spec: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

type EstimateForm = {
  estimateNo: string;
  customerId: string;
  createCustomer: boolean;
  newCustomerName: string;
  newCustomerContact: string;
  newCustomerAddress: string;
  siteName: string;
  title: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  status: EstimateStatus;
  taxPercent: string;
  lines: LineForm[];
};

type LocationState = { duplicatedFrom?: string; justSaved?: boolean } | null;

function blankLine(): LineForm {
  return {
    key: crypto.randomUUID(),
    itemName: "",
    spec: "",
    quantity: "1",
    unit: "㎡",
    unitPrice: "0",
  };
}

function discountLine(): LineForm {
  return {
    key: crypto.randomUUID(),
    itemName: "値引き",
    spec: "",
    quantity: "1",
    unit: "式",
    unitPrice: "-",
  };
}

function emptyForm(estimateNo = ""): EstimateForm {
  const issueDate = todayISO();
  return {
    estimateNo,
    customerId: "",
    createCustomer: false,
    newCustomerName: "",
    newCustomerContact: "",
    newCustomerAddress: "",
    siteName: "",
    title: "",
    issueDate,
    validUntil: addDaysISO(issueDate, 30),
    notes: "",
    status: "draft",
    taxPercent: "10",
    lines: [blankLine()],
  };
}

function fromDetail(detail: EstimateDetail): EstimateForm {
  return {
    estimateNo: detail.estimateNo,
    customerId: detail.customerId ?? "",
    createCustomer: false,
    newCustomerName: "",
    newCustomerContact: "",
    newCustomerAddress: "",
    siteName: detail.siteName,
    title: detail.title,
    issueDate: detail.issueDate ?? "",
    validUntil: detail.validUntil ?? "",
    notes: detail.notes,
    status: detail.status,
    taxPercent: rateToPercentInput(detail.taxRate || 0.1),
    lines:
      detail.items.length > 0
        ? detail.items.map((item) => ({
            key: item.id,
            id: item.id,
            itemName: item.itemName,
            spec: item.spec,
            quantity: String(item.quantity),
            unit: item.unit,
            unitPrice: String(item.unitPrice),
          }))
        : [blankLine()],
  };
}

function isIgnorable(line: LineForm): boolean {
  return !line.itemName.trim() && !line.spec.trim() && (line.unitPrice.trim() === "" || line.unitPrice.trim() === "0");
}

function collectLines(lines: LineForm[]): { error: string | null; items: EstimateLineInput[] } {
  const items: EstimateLineInput[] = [];
  for (const line of lines) {
    if (isIgnorable(line)) continue;
    const itemName = line.itemName.trim();
    if (!itemName) return { error: "品名を入力してください。", items: [] };
    const quantity = parseDecimal(line.quantity);
    const unitPrice = parseYen(line.unitPrice);
    if (quantity == null || quantity < 0 || unitPrice == null) {
      return { error: `「${itemName}」の数量は0以上、単価は数値にしてください。値引きは単価をマイナスにします。`, items: [] };
    }
    items.push({
      id: line.id,
      itemName,
      spec: line.spec,
      quantity,
      unit: line.unit,
      unitPrice,
    });
  }
  return { error: null, items };
}

export function EstimateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as LocationState;
  const { setDirty } = useUnsaved();
  const { settings } = useCompany();
  useVoiceApply(({ transcript, intent }) => {
    if (intent.kind === "estimate" && intent.keyword) patch({ title: intent.keyword });
    else if (intent.kind === "text" && transcript) patch({ notes: transcript });
    setNotice("聞き取りを欄に入れました。保存はしていません。");
  });
  const mailRef = useRef<HTMLDivElement>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<EstimateForm>(() => emptyForm());
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showMail, setShowMail] = useState(false);
  const [copied, setCopied] = useState("");
  const [orderedOn, setOrderedOn] = useState(todayISO);

  const dirty = baseline !== "" && JSON.stringify(form) !== baseline;

  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const loadedCustomers = await listCustomers();
        if (!active) return;
        setCustomers(loadedCustomers);
        if (!id) {
          const estimateNo = await suggestEstimateNo();
          if (!active) return;
          const next = emptyForm(estimateNo);
          setForm(next);
          setBaseline(JSON.stringify(next));
          setNotice("");
        } else {
          const detail = await getEstimate(id);
          if (!active) return;
          if (!detail) {
            setError("見積が見つかりません。");
            setBaseline("");
          } else {
            const next = fromDetail(detail);
            setForm(next);
            setBaseline(JSON.stringify(next));
            if (state?.duplicatedFrom) {
              setNotice(
                `${state.duplicatedFrom} をベースに下書きを作りました。発行日は本日、有効期限は30日後です。必要なら直して保存してください。`,
              );
            } else if (state?.justSaved) {
              setNotice("保存しました。");
            }
          }
        }
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
  }, [id, state?.duplicatedFrom, state?.justSaved]);

  function patch(partial: Partial<EstimateForm>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function patchLine(key: string, partial: Partial<LineForm>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...partial } : line)),
    }));
  }

  function moveLine(index: number, direction: -1 | 1) {
    setForm((current) => {
      const next = current.lines.slice();
      const target = index + direction;
      const row = next[index];
      const other = next[target];
      if (!row || !other) return current;
      next[index] = other;
      next[target] = row;
      return { ...current, lines: next };
    });
  }

  const preview = useMemo(() => {
    const percent = parsePercent(form.taxPercent);
    const taxRate = percent == null ? 0.1 : percentToRate(percent);
    const priced = form.lines.map((line) => {
      const quantity = parseDecimal(line.quantity);
      const unitPrice = parseYen(line.unitPrice);
      const amount = quantity == null || unitPrice == null ? null : lineAmount(quantity, unitPrice);
      return { line, quantity, unitPrice, amount };
    });
    const items = collectLines(form.lines).items;
    const totals = summarize(items, taxRate);
    return { percent, taxRate, priced, items, totals };
  }, [form.lines, form.taxPercent]);

  const customerName = form.createCustomer
    ? form.newCustomerName.trim()
    : (customers.find((customer) => customer.id === form.customerId)?.name ?? "");

  const mail = buildEstimateEmail({
    estimateNo: form.estimateNo.trim() || "（未設定）",
    customerName,
    siteName: form.siteName.trim(),
    title: form.title.trim(),
    issueDate: form.issueDate || null,
    validUntil: form.validUntil || null,
    notes: form.notes,
    companyName: settings.companyName,
    trade: settings.trade,
    email: primaryEmail(settings),
    lines: preview.items.map((item) => ({
      itemName: item.itemName,
      spec: item.spec.trim(),
      quantity: item.quantity,
      unit: item.unit.trim(),
      unitPrice: item.unitPrice,
      amount: lineAmount(item.quantity, item.unitPrice),
    })),
    subtotal: preview.totals.subtotal,
    taxRate: preview.taxRate,
    tax: preview.totals.tax,
    total: preview.totals.total,
  });

  function validate(): string | null {
    if (!form.estimateNo.trim()) return "見積番号を入力してください。";
    if (form.createCustomer && !form.newCustomerName.trim()) return "新しい得意先の名前を入力してください。";
    if (preview.percent == null) return "消費税率は0から100までの数値にしてください。";
    return collectLines(form.lines).error;
  }

  async function persist(): Promise<string | null> {
    const problem = validate();
    if (problem) {
      setError(problem);
      setNotice("");
      return null;
    }
    if (preview.percent == null) return null;
    setSaving(true);
    setError("");
    try {
      const savedId = await saveEstimate({
        id,
        estimateNo: form.estimateNo,
        customerId: form.createCustomer ? null : form.customerId || null,
        newCustomer: form.createCustomer
          ? {
              name: form.newCustomerName,
              contact: form.newCustomerContact,
              address: form.newCustomerAddress,
            }
          : null,
        siteName: form.siteName,
        title: form.title,
        issueDate: form.issueDate,
        validUntil: form.validUntil,
        status: form.status,
        notes: form.notes,
        taxPercent: preview.percent,
        lines: preview.items,
      });
      const fresh = await getEstimate(savedId);
      const loadedCustomers = await listCustomers();
      setCustomers(loadedCustomers);
      if (fresh) {
        const next = fromDetail(fresh);
        setForm(next);
        setBaseline(JSON.stringify(next));
      }
      if (!id) {
        navigate(`/estimates/${savedId}`, { replace: true, state: { justSaved: true } });
      } else {
        setNotice("保存しました。");
      }
      return savedId;
    } catch (caught) {
      setError(toMessage(caught));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist();
  }

  async function markOrdered() {
    const savedId = dirty || !id ? await persist() : id;
    if (!savedId) return;
    setSaving(true);
    setError("");
    try {
      await markEstimateOrdered(savedId, orderedOn || todayISO());
      patch({ status: "accepted" });
      setNotice("受注にしました。受注一覧に入ります。メールは送っていません。");
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function printQuote() {
    const savedId = dirty || !id ? await persist() : id;
    if (!savedId) return;
    navigate(`/estimates/${savedId}/print`);
  }

  function openMail() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setShowMail(true);
    window.setTimeout(() => mailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function copyMail() {
    const text = `件名：${mail.subject}\n\n${mail.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("件名と本文をコピーしました。");
    } catch {
      setCopied("コピーできませんでした。下の文章を選択してコピーしてください。");
    }
  }

  async function duplicate() {
    if (!id) return;
    if (dirty && !window.confirm("保存していない変更は複製に含まれません。このまま複製しますか？")) return;
    setSaving(true);
    setError("");
    try {
      const created = await duplicateEstimate(id);
      navigate(`/estimates/${created.id}`, { state: { duplicatedFrom: created.fromNo } });
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function suggestNo() {
    try {
      patch({ estimateNo: await suggestEstimateNo() });
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  if (loading) return <p className="fine">読み込み中…</p>;

  return (
    <form className="stack" onSubmit={(event) => void onSubmit(event)}>
      <div className="page-head">
        <div>
          <h1>{id ? "見積を編集" : "見積を作成"}</h1>
          <p className="lead">金額は入力に合わせて計算します。保存した内容が印刷と次回の下書きの元になります。</p>
        </div>
        {id ? <StatusPill status={form.status} /> : null}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}

      <section className="card stack">
        <h2>見出し</h2>
        <div className="grid-2">
          <TextField label="見積番号" value={form.estimateNo} onChange={(estimateNo) => patch({ estimateNo })} required />
          <div className="field">
            <span>番号の提案</span>
            <button className="btn quiet" type="button" onClick={() => void suggestNo()}>
              EST-年-連番を入れる
            </button>
          </div>
          <TextField label="受注日" type="date" value={orderedOn} onChange={setOrderedOn} />
          <div className="field">
            <span>受注</span>
            <button className="btn" type="button" disabled={saving} onClick={() => void markOrdered()}>
              受注にする
            </button>
          </div>
          <SelectField label="状態" value={form.status} onChange={(value) => patch({ status: value as EstimateStatus })}>
            {ESTIMATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </SelectField>
          <TextField label="発行日" type="date" value={form.issueDate} onChange={(issueDate) => patch({ issueDate })} />
          <TextField label="有効期限" type="date" value={form.validUntil} onChange={(validUntil) => patch({ validUntil })} />
          <TextField label="現場名" value={form.siteName} onChange={(siteName) => patch({ siteName })} />
          <FieldMic onApply={(siteName) => patch({ siteName })} />
          <TextField label="件名" value={form.title} onChange={(title) => patch({ title })} />
          <FieldMic onApply={(title) => patch({ title })} />
        </div>
        <div className="segment" role="group" aria-label="得意先の選び方">
          <button type="button" className={!form.createCustomer ? "on" : ""} onClick={() => patch({ createCustomer: false })}>
            登録済みから選ぶ
          </button>
          <button type="button" className={form.createCustomer ? "on" : ""} onClick={() => patch({ createCustomer: true })}>
            新しく登録
          </button>
        </div>
        {form.createCustomer ? (
          <div className="grid-2">
            <TextField
              label="得意先名"
              value={form.newCustomerName}
              onChange={(newCustomerName) => patch({ newCustomerName })}
              required
            />
            <TextField
              label="連絡先"
              value={form.newCustomerContact}
              onChange={(newCustomerContact) => patch({ newCustomerContact })}
            />
            <TextField
              label="住所"
              value={form.newCustomerAddress}
              onChange={(newCustomerAddress) => patch({ newCustomerAddress })}
            />
          </div>
        ) : (
          <SelectField label="得意先" value={form.customerId} onChange={(customerId) => patch({ customerId })}>
            <option value="">未選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextArea label="備考" value={form.notes} onChange={(notes) => patch({ notes })} />
        <FieldMic onApply={(notes) => patch({ notes })} />
      </section>

      <section className="card stack">
        <h2>明細</h2>
        <datalist id="unit-suggestions">
          {UNIT_SUGGESTIONS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
        {form.lines.map((line, index) => {
          const priced = preview.priced[index];
          return (
            <div key={line.key} className="line-card">
              <div className="line-grid">
                <TextField label="品名" value={line.itemName} onChange={(itemName) => patchLine(line.key, { itemName })} />
                <TextField label="仕様" value={line.spec} onChange={(spec) => patchLine(line.key, { spec })} />
                <TextField
                  label="数量"
                  value={line.quantity}
                  inputMode="decimal"
                  onChange={(quantity) => patchLine(line.key, { quantity })}
                />
                <TextField
                  label="単位"
                  value={line.unit}
                  list="unit-suggestions"
                  placeholder="㎡ / m / 式"
                  onChange={(unit) => patchLine(line.key, { unit })}
                />
                <TextField
                  label="単価"
                  value={line.unitPrice}
                  inputMode="text"
                  placeholder="値引きは -1000"
                  onChange={(unitPrice) => patchLine(line.key, { unitPrice })}
                />
                <div className="field">
                  <span>金額</span>
                  <strong className={`money line-amount${priced?.amount != null && isDiscount(priced.amount) ? " discount" : ""}`}>
                    {priced?.amount == null ? "—" : formatYen(priced.amount)}
                  </strong>
                </div>
              </div>
              <div className="row-actions">
                <button className="btn quiet" type="button" disabled={index === 0} onClick={() => moveLine(index, -1)}>
                  上へ
                </button>
                <button
                  className="btn quiet"
                  type="button"
                  disabled={index === form.lines.length - 1}
                  onClick={() => moveLine(index, 1)}
                >
                  下へ
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() =>
                    patch({
                      lines: form.lines.length === 1 ? [blankLine()] : form.lines.filter((item) => item.key !== line.key),
                    })
                  }
                >
                  行を削除
                </button>
              </div>
            </div>
          );
        })}
        <p className="fine">金額は数量×単価です。値引きと端数調整は、単価をマイナスにしてください。</p>
        <div className="row-actions">
          <button className="btn quiet" type="button" onClick={() => patch({ lines: [...form.lines, blankLine()] })}>
            行を追加
          </button>
          <button className="btn quiet" type="button" onClick={() => patch({ lines: [...form.lines, discountLine()] })}>
            値引き行を追加
          </button>
        </div>
      </section>

      <section className="card totals">
        <div className="total-row">
          <span>小計</span>
          <strong className={`money${isDiscount(preview.totals.subtotal) ? " discount" : ""}`}>{formatYen(preview.totals.subtotal)}</strong>
        </div>
        <label className="total-row">
          <span>消費税率（%）</span>
          <input
            className="tax-input"
            inputMode="decimal"
            value={form.taxPercent}
            onChange={(event) => patch({ taxPercent: event.target.value })}
            aria-label="消費税率（%）"
          />
        </label>
        <div className="total-row">
          <span>消費税</span>
          <strong className={`money${isDiscount(preview.totals.tax) ? " discount" : ""}`}>{formatYen(preview.totals.tax)}</strong>
        </div>
        <div className="total-row grand">
          <span>合計（税込）</span>
          <strong className={`money${isDiscount(preview.totals.total) ? " discount" : ""}`}>{formatYen(preview.totals.total)}</strong>
        </div>
      </section>

      <div className="savebar">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "保存中…" : "保存する"}
        </button>
        <button className="btn quiet" type="button" disabled={saving} onClick={() => void printQuote()}>
          印刷 / PDF
        </button>
        <button className="btn quiet" type="button" onClick={openMail}>
          メール下書きを作る
        </button>
      </div>

      {showMail ? (
        <section className="card mail-card stack" ref={mailRef}>
          <HazardStripe />
          <div className="mail-head">
            <h2>メール下書き</h2>
            <span className="pill pill-sent">担当者の確認待ち</span>
          </div>
          <p className="fine">表示中の内容で下書きを作ります。保存前の変更も含みます。見積書PDFを添付して送ります。</p>
          <TextField label="件名" value={mail.subject} readOnly onChange={() => undefined} />
          <label className="field">
            <span>本文</span>
            <textarea readOnly rows={16} value={mail.body} />
          </label>
          <MailSendPanel
            kind="estimate"
            refId={id}
            subject={mail.subject}
            body={mail.body}
            makeAttachment={() =>
              renderDocumentPdf({
                heading: "御見積書",
                numberLabel: "見積番号",
                number: form.estimateNo,
                customer: customerName,
                title: form.title,
                site: form.siteName,
                dateLabel: "発行日",
                date: form.issueDate,
                lines: preview.items.map((item) => ({
                  name: item.itemName,
                  spec: item.spec,
                  qty: String(item.quantity),
                  unit: item.unit,
                  price: formatYen(item.unitPrice),
                  amount: formatYen(lineAmount(item.quantity, item.unitPrice)),
                })),
                subtotal: formatYen(preview.totals.subtotal),
                tax: formatYen(preview.totals.tax),
                total: formatYen(preview.totals.total),
                notes: form.notes,
                issuer: `${settings.companyName}　${settings.trade}`,
              }).then((bytes) => ({ filename: `${form.estimateNo || "estimate"}.pdf`, bytes }))
            }
          />
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => void copyMail()}>
              件名と本文をコピー
            </button>
            <button className="btn quiet" type="button" onClick={() => setShowMail(false)}>
              閉じる
            </button>
          </div>
          {copied ? <Banner tone="ok">{copied}</Banner> : null}
        </section>
      ) : null}

      {id ? (
        <div className="row-actions">
          <button className="btn quiet" type="button" disabled={saving} onClick={() => void duplicate()}>
            過去の見積りをベースに下書きを作る
          </button>
          <button className="btn quiet" type="button" onClick={() => navigate("/estimates")}>
            一覧へ戻る
          </button>
        </div>
      ) : (
        <button className="btn quiet" type="button" onClick={() => navigate("/estimates")}>
          一覧へ戻る
        </button>
      )}
    </form>
  );
}
