import { AppError } from "./errors.ts";
import { addDaysISO, asNumber, lineAmount, normalizeQuantity, percentToRate, summarize, todayISO } from "./money.ts";
import { supabase } from "./supabase.ts";
import {
  isEstimateStatus,
  type Customer,
  type EstimateDetail,
  type EstimateItem,
  type EstimateListItem,
  type EstimateStatus,
} from "./types.ts";

type Raw = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function one(value: unknown): Raw | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Raw) : null;
  }
  if (value && typeof value === "object") return value as Raw;
  return null;
}

function mapCustomer(row: Raw): Customer {
  return {
    id: text(row.id),
    name: text(row.name),
    contact: text(row.contact),
    address: text(row.address),
    notes: text(row.notes),
  };
}

function mapItem(row: Raw): EstimateItem {
  return {
    id: text(row.id),
    sort: asNumber(row.sort),
    itemName: text(row.item_name),
    spec: text(row.spec),
    quantity: asNumber(row.quantity),
    unit: text(row.unit),
    unitPrice: asNumber(row.unit_price),
    amount: asNumber(row.amount),
  };
}

function mapListItem(row: Raw): EstimateListItem {
  const customer = one(row.customers);
  const status = isEstimateStatus(row.status) ? row.status : "draft";
  return {
    id: text(row.id),
    estimateNo: text(row.estimate_no),
    customerId: text(row.customer_id) || null,
    customerName: customer ? text(customer.name) : "",
    siteName: text(row.site_name),
    title: text(row.title),
    issueDate: text(row.issue_date) || null,
    validUntil: text(row.valid_until) || null,
    status,
    total: asNumber(row.total),
    awaitingConfirmation: row.awaiting_confirmation === true,
  };
}

function mapDetail(row: Raw): EstimateDetail {
  const items = Array.isArray(row.estimate_items) ? row.estimate_items.map((item) => mapItem(item as Raw)) : [];
  items.sort((a, b) => a.sort - b.sort);
  return {
    ...mapListItem(row),
    notes: text(row.notes),
    subtotal: asNumber(row.subtotal),
    taxRate: asNumber(row.tax_rate),
    tax: asNumber(row.tax),
    items,
  };
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from("customers").select("id, name, contact, address, notes").order("name");
  if (error) throw error;
  return ((data ?? []) as Raw[]).map(mapCustomer).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function saveCustomer(input: {
  id?: string;
  name: string;
  contact: string;
  address: string;
  notes: string;
}): Promise<string> {
  const payload = {
    name: input.name.trim(),
    contact: textOrNull(input.contact),
    address: textOrNull(input.address),
    notes: textOrNull(input.notes),
  };
  if (!payload.name) throw new AppError("得意先名を入力してください。");
  if (input.id) {
    const { error } = await supabase.from("customers").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
  if (error) throw error;
  return text((data as Raw).id);
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

export async function listEstimates(): Promise<EstimateListItem[]> {
  const { data, error } = await supabase
    .from("estimates")
    .select(
      "id, estimate_no, customer_id, site_name, title, issue_date, valid_until, status, total, awaiting_confirmation, customers(name)",
    )
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map(mapListItem);
}

export async function getEstimate(id: string): Promise<EstimateDetail | null> {
  const { data, error } = await supabase
    .from("estimates")
    .select(
      "id, estimate_no, customer_id, site_name, title, issue_date, valid_until, status, notes, subtotal, tax_rate, tax, total, customers(name), estimate_items(id, sort, item_name, spec, quantity, unit, unit_price, amount)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapDetail(data as Raw);
}

export async function suggestEstimateNo(date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const prefix = `EST-${year}-`;
  const { data, error } = await supabase.from("estimates").select("estimate_no").like("estimate_no", `${prefix}%`);
  if (error) throw error;
  let max = 0;
  const pattern = new RegExp(`^EST-${year}-(\\d+)$`);
  for (const row of (data ?? []) as Raw[]) {
    const match = pattern.exec(text(row.estimate_no));
    if (!match?.[1]) continue;
    max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export type EstimateLineInput = {
  id?: string;
  itemName: string;
  spec: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type EstimateInput = {
  id?: string;
  estimateNo: string;
  customerId: string | null;
  newCustomer: { name: string; contact: string; address: string } | null;
  siteName: string;
  title: string;
  issueDate: string;
  validUntil: string;
  status: EstimateStatus;
  notes: string;
  taxPercent: number;
  lines: EstimateLineInput[];
};

async function insertEstimateRow(
  payload: Record<string, unknown>,
  preferredNo: string,
  allowRenumber: boolean,
): Promise<{ id: string; estimateNo: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  let estimateNo = preferredNo;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from("estimates")
      .insert({ ...payload, estimate_no: estimateNo, created_by: sessionData.session?.user.id ?? null })
      .select("id, estimate_no")
      .single();
    if (!error && data) {
      const row = data as Raw;
      return { id: text(row.id), estimateNo: text(row.estimate_no) };
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (allowRenumber && code === "23505" && attempt === 0) {
      estimateNo = await suggestEstimateNo();
      continue;
    }
    throw error ?? new AppError("見積を保存できませんでした。");
  }
  throw new AppError("見積番号を決められませんでした。");
}

async function syncItems(estimateId: string, lines: EstimateLineInput[]): Promise<void> {
  const keptIds = lines.flatMap((line) => (line.id ? [line.id] : []));
  let deletion = supabase.from("estimate_items").delete().eq("estimate_id", estimateId);
  if (keptIds.length > 0) {
    deletion = deletion.not("id", "in", `(${keptIds.map((itemId) => `"${itemId}"`).join(",")})`);
  }
  const { error: deleteError } = await deletion;
  if (deleteError) throw deleteError;

  const rows = lines.map((line, index) => {
    const quantity = normalizeQuantity(line.quantity);
    const unitPrice = Math.round(line.unitPrice);
    return {
      ...(line.id ? { id: line.id } : {}),
      estimate_id: estimateId,
      sort: index,
      item_name: line.itemName.trim(),
      spec: textOrNull(line.spec),
      quantity,
      unit: textOrNull(line.unit),
      unit_price: unitPrice,
      amount: lineAmount(quantity, unitPrice),
    };
  });
  const existing = rows.filter((row) => "id" in row && row.id);
  const fresh = rows.filter((row) => !("id" in row) || !row.id);
  if (existing.length > 0) {
    const { error } = await supabase.from("estimate_items").upsert(existing);
    if (error) throw error;
  }
  if (fresh.length > 0) {
    const { error } = await supabase.from("estimate_items").insert(fresh);
    if (error) throw error;
  }
}

export async function saveEstimate(input: EstimateInput): Promise<string> {
  const estimateNo = input.estimateNo.trim();
  if (!estimateNo) throw new AppError("見積番号を入力してください。");
  let customerId = input.customerId;
  if (input.newCustomer) {
    customerId = await saveCustomer({
      name: input.newCustomer.name,
      contact: input.newCustomer.contact,
      address: input.newCustomer.address,
      notes: "",
    });
  }
  const taxRate = percentToRate(input.taxPercent);
  const totals = summarize(
    input.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
    taxRate,
  );
  const payload = {
    customer_id: customerId,
    site_name: textOrNull(input.siteName),
    title: textOrNull(input.title),
    issue_date: textOrNull(input.issueDate),
    valid_until: textOrNull(input.validUntil),
    status: input.status,
    notes: textOrNull(input.notes),
    subtotal: totals.subtotal,
    tax_rate: taxRate,
    tax: totals.tax,
    total: totals.total,
  };
  let id = input.id;
  if (!id) {
    const created = await insertEstimateRow(payload, estimateNo, false);
    id = created.id;
  } else {
    const { error } = await supabase.from("estimates").update({ ...payload, estimate_no: estimateNo }).eq("id", id);
    if (error) throw error;
  }
  await syncItems(id, input.lines);
  return id;
}

export async function deleteEstimate(id: string): Promise<void> {
  const { error } = await supabase.from("estimates").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateEstimate(id: string): Promise<{ id: string; fromNo: string }> {
  const source = await getEstimate(id);
  if (!source) throw new AppError("元の見積が見つかりません。");
  const issueDate = todayISO();
  const validUntil = addDaysISO(issueDate, 30);
  const created = await insertEstimateRow(
    {
      customer_id: source.customerId,
      site_name: textOrNull(source.siteName),
      title: textOrNull(source.title),
      issue_date: issueDate,
      valid_until: validUntil,
      status: "draft",
      notes: textOrNull(source.notes),
      subtotal: source.subtotal,
      tax_rate: source.taxRate,
      tax: source.tax,
      total: source.total,
    },
    await suggestEstimateNo(),
    true,
  );
  if (source.items.length > 0) {
    const { error } = await supabase.from("estimate_items").insert(
      source.items.map((item, index) => ({
        estimate_id: created.id,
        sort: index,
        item_name: item.itemName,
        spec: textOrNull(item.spec),
        quantity: item.quantity,
        unit: textOrNull(item.unit),
        unit_price: item.unitPrice,
        amount: item.amount,
      })),
    );
    if (error) throw error;
  }
  return { id: created.id, fromNo: source.estimateNo };
}
