import { useEffect, useMemo, useState } from "react";
import { Banner, TextArea, TextField } from "../components/ui.tsx";
import { deleteCustomer, listCustomers, saveCustomer } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import type { Customer } from "../lib/types.ts";

const EMPTY = { id: "", name: "", contact: "", address: "", notes: "" };

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setRows(await listCustomers());
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ja");
    if (!needle) return rows;
    return rows.filter((row) => [row.name, row.contact, row.address, row.notes].join(" ").toLocaleLowerCase("ja").includes(needle));
  }, [query, rows]);

  function patch(partial: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function onSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveCustomer({
        id: form.id || undefined,
        name: form.name,
        contact: form.contact,
        address: form.address,
        notes: form.notes,
      });
      setForm(EMPTY);
      setNotice(form.id ? "得意先を更新しました。" : "得意先を登録しました。");
      await reload();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Customer) {
    if (!window.confirm(`得意先「${row.name}」を削除しますか？`)) return;
    setError("");
    setNotice("");
    try {
      await deleteCustomer(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (form.id === row.id) setForm(EMPTY);
      setNotice(`${row.name} を削除しました。`);
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>得意先</h1>
        <p className="lead">見積で選ぶ顧客です。見積の編集画面から新しく登録することもできます。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <h2>{form.id ? "得意先を編集" : "得意先を登録"}</h2>
        <TextField label="得意先名" value={form.name} onChange={(name) => patch({ name })} required />
        <TextField label="連絡先" value={form.contact} onChange={(contact) => patch({ contact })} placeholder="担当者・電話・メール" />
        <TextField label="住所" value={form.address} onChange={(address) => patch({ address })} />
        <TextArea label="備考" value={form.notes} onChange={(notes) => patch({ notes })} />
        <div className="row-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "保存中…" : form.id ? "更新する" : "登録する"}
          </button>
          {form.id ? (
            <button className="btn quiet" type="button" onClick={() => setForm(EMPTY)}>
              キャンセル
            </button>
          ) : null}
        </div>
      </form>
      <label className="field">
        <span>検索</span>
        <input type="search" value={query} placeholder="名前・連絡先・住所" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {loading ? <p className="fine">読み込み中…</p> : null}
      {!loading && filtered.length === 0 ? <Banner>該当する得意先はありません。</Banner> : null}
      {filtered.map((row) => (
        <article key={row.id} className="card">
          <h2>{row.name}</h2>
          <p className="meta">
            {row.contact || "連絡先未設定"}
            <br />
            {row.address || "住所未設定"}
          </p>
          {row.notes ? <p className="meta">{row.notes}</p> : null}
          <div className="row-actions">
            <button className="btn quiet" type="button" onClick={() => setForm(row)}>
              編集
            </button>
            <button className="btn danger" type="button" onClick={() => void remove(row)}>
              削除
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
