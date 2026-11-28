import { getEstimate, saveEstimate, suggestEstimateNo } from "./api.ts";
import { AppError } from "./errors.ts";
import { addDaysISO, asNumber, lineAmount, normalizeQuantity, percentToRate, summarize, todayISO } from "./money.ts";
import { supabase } from "./supabase.ts";
import {
  isCostCategory,
  isDocKind,
  isDocStatus,
  isInvoiceStatus,
  isJobPhase,
  isPhotoStage,
  type DocKind,
  type DocStatus,
  type DocumentRow,
  type InboxItem,
  type InvoiceDetail,
  type InvoiceLine,
  type InvoiceStatus,
  type JobCost,
  type JobDay,
  type JobDetail,
  type JobPhase,
  type PhotoStage,
  type SitePhoto,
  type TripDetail,
} from "./portalTypes.ts";

type Raw = Record<string, unknown>;
const FICTION_MARK = "架空の見本";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function blankKey(): string {
  return crypto.randomUUID();
}

async function syncChildRows(
  table: "job_days" | "job_costs" | "trip_checks" | "invoice_items",
  parentColumn: "job_id" | "trip_id" | "invoice_id",
  parentId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const kept = rows.flatMap((row) => (typeof row.id === "string" ? [row.id] : []));
  let deletion = supabase.from(table).delete().eq(parentColumn, parentId);
  if (kept.length > 0) deletion = deletion.not("id", "in", `(${kept.map((id) => `"${id}"`).join(",")})`);
  const { error: deleteError } = await deletion;
  if (deleteError) throw deleteError;
  const existing = rows.filter((row) => typeof row.id === "string");
  const fresh = rows.filter((row) => typeof row.id !== "string");
  if (existing.length > 0) {
    const { error } = await supabase.from(table).upsert(existing);
    if (error) throw error;
  }
  if (fresh.length > 0) {
    const { error } = await supabase.from(table).insert(fresh);
    if (error) throw error;
  }
}

export async function listJobs(): Promise<
  { id: string; title: string; siteName: string; address: string; phase: JobPhase; startDate: string | null; endDate: string | null; progress: number; customerName: string }[]
> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, site_name, address, phase, start_date, end_date, progress, customers(name)")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => {
    const siteName = text(row.site_name) || text(row.title);
    return {
    id: text(row.id),
    title: siteName,
    siteName,
    address: text(row.address),
    phase: isJobPhase(row.phase) ? row.phase : "plan",
    startDate: text(row.start_date) || null,
    endDate: text(row.end_date) || null,
    progress: asNumber(row.progress),
    customerName: text(one(row.customers)?.name),
  };
  });
}

export async function getJob(id: string): Promise<JobDetail | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, customers(name), job_days(*), job_costs(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Raw;
  const days = (Array.isArray(row.job_days) ? row.job_days : [])
    .map((item) => item as Raw)
    .sort((a, b) => asNumber(a.sort) - asNumber(b.sort))
    .map((item) => ({
      id: text(item.id),
      key: text(item.id),
      workDate: text(item.work_date),
      workContent: text(item.work_content),
      paint: text(item.paint),
      assignee: text(item.assignee),
      hours: String(asNumber(item.hours)),
    }));
  const costs = (Array.isArray(row.job_costs) ? row.job_costs : [])
    .map((item) => item as Raw)
    .sort((a, b) => asNumber(a.sort) - asNumber(b.sort))
    .map((item) => ({
      id: text(item.id),
      key: text(item.id),
      category: isCostCategory(item.category) ? item.category : "その他",
      label: text(item.label),
      amount: String(asNumber(item.amount)),
      costDate: text(item.cost_date),
    }));
  return {
    id: text(row.id),
    customerId: text(row.customer_id) || null,
    customerName: text(one(row.customers)?.name),
    title: text(row.site_name) || text(row.title),
    siteName: text(row.site_name) || text(row.title),
    address: text(row.address),
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    phase: isJobPhase(row.phase) ? row.phase : "plan",
    startDate: text(row.start_date) || null,
    endDate: text(row.end_date) || null,
    progress: asNumber(row.progress),
    notes: text(row.notes),
    days: days.length > 0 ? days : [{ key: blankKey(), workDate: "", workContent: "", paint: "", assignee: "", hours: "0" }],
    costs,
  };
}

export async function createJob(input: { title?: string; siteName: string; customerId: string | null }): Promise<string> {
  const siteName = input.siteName.trim() || input.title?.trim() || "";
  if (!siteName) throw new AppError("現場名を入力してください。");
  const { data, error } = await supabase
    .from("jobs")
    .insert({ title: siteName, site_name: siteName, customer_id: input.customerId, phase: "plan" })
    .select("id")
    .single();
  if (error) throw error;
  return text((data as Raw).id);
}

export type OrderRow = {
  id: string;
  estimateId: string;
  estimateNo: string;
  customerName: string;
  siteName: string;
  jobId: string | null;
  orderedOn: string;
  amount: number;
};

export async function listOrders(from: string | null, to: string | null): Promise<OrderRow[]> {
  const { data, error } = await supabase.rpc("list_orders", { from, to });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    estimateId: text(row.estimate_id),
    estimateNo: text(row.estimate_no),
    customerName: text(row.customer_name),
    siteName: text(row.site_name),
    jobId: text(row.job_id) || null,
    orderedOn: text(row.ordered_on),
    amount: asNumber(row.amount),
  }));
}

export async function markEstimateOrdered(estimateId: string, orderedOn: string): Promise<void> {
  const { error } = await supabase.rpc("mark_estimate_ordered", { estimate_id: estimateId, ordered_on: orderedOn });
  if (error) throw error;
}

export async function createJobFromOrder(order: OrderRow): Promise<string> {
  if (order.jobId) return order.jobId;
  const { data, error } = await supabase.rpc("create_job", {
    title: order.siteName,
    site_name: order.siteName,
    customer_name: order.customerName,
    start_on: null,
    end_on: null,
  });
  if (error) throw error;
  const jobId = text(data);
  const { error: linkError } = await supabase.from("orders").update({ job_id: jobId }).eq("id", order.id);
  if (linkError) throw linkError;
  if (order.estimateId) {
    await supabase.from("estimates").update({ job_id: jobId }).eq("id", order.estimateId);
  }
  return jobId;
}

export type InquiryRow = {
  id: string;
  receivedOn: string;
  customerId: string | null;
  customerName: string;
  siteName: string;
  details: string;
  source: string;
  status: string;
  notes: string;
  expenseTotal: number;
  estimateId: string | null;
  estimateNo: string;
};

export type SiteSurvey = { id: string; visitOn: string | null; visitTime: string; attendees: string; notes: string };
export type InquiryExpense = { id: string; spentOn: string | null; category: string; amount: number; notes: string };

export const INQUIRY_STATUSES = ["受付", "見積中", "受注", "失注", "保留"] as const;
export const EXPENSE_CATEGORIES = ["交通費", "高速代", "宿泊", "材料サンプル", "人工", "その他"] as const;

export async function listInquiries(status: string | null = null): Promise<InquiryRow[]> {
  const { data, error } = await supabase.rpc("list_inquiries", { status_filter: status });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    receivedOn: text(row.received_on),
    customerId: text(row.customer_id) || null,
    customerName: text(row.customer_name),
    siteName: text(row.site_name),
    details: text(row.details),
    source: text(row.source),
    status: text(row.status),
    notes: text(row.notes),
    expenseTotal: asNumber(row.expense_total),
    estimateId: text(row.estimate_id) || null,
    estimateNo: text(row.estimate_no),
  }));
}

export async function createInquiry(input: {
  receivedOn: string;
  customerName: string;
  siteName: string;
  details: string;
  source: string;
  notes: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_inquiry", {
    received_on: input.receivedOn || null,
    customer_name: input.customerName,
    site_name: input.siteName,
    details: input.details,
    source: input.source,
    notes: input.notes,
  });
  if (error) throw error;
  return text(data);
}

export async function updateInquiryStatus(inquiryId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc("update_inquiry_status", { inquiry_id: inquiryId, status });
  if (error) throw error;
}

export async function listSiteSurveys(inquiryId: string): Promise<SiteSurvey[]> {
  const { data, error } = await supabase
    .from("inquiry_surveys")
    .select("id, visit_on, visit_time, attendees, notes")
    .eq("inquiry_id", inquiryId)
    .order("visit_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    visitOn: text(row.visit_on) || null,
    visitTime: text(row.visit_time).slice(0, 5),
    attendees: text(row.attendees),
    notes: text(row.notes),
  }));
}

export async function listInquiryExpenses(inquiryId: string): Promise<InquiryExpense[]> {
  const { data, error } = await supabase
    .from("inquiry_expenses")
    .select("id, spent_on, category, amount, notes")
    .eq("inquiry_id", inquiryId)
    .order("spent_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    spentOn: text(row.spent_on) || null,
    category: text(row.category),
    amount: asNumber(row.amount),
    notes: text(row.notes),
  }));
}

export async function addSiteSurvey(input: {
  inquiryId: string;
  visitOn: string;
  visitTime: string;
  attendees: string;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc("add_site_survey", {
    inquiry_id: input.inquiryId,
    visit_on: input.visitOn || null,
    visit_time: input.visitTime || null,
    attendees: input.attendees,
    notes: input.notes,
  });
  if (error) throw error;
}

export async function addInquiryExpense(input: {
  inquiryId: string;
  spentOn: string;
  category: string;
  amount: number;
  notes: string;
}): Promise<void> {
  const { error } = await supabase.rpc("add_inquiry_expense", {
    inquiry_id: input.inquiryId,
    spent_on: input.spentOn || null,
    category: input.category,
    amount: input.amount,
    notes: input.notes,
  });
  if (error) throw error;
}

export type AiLink = { section: string; id: string; label: string };

export type AiInboxItem = {
  id: string;
  createdAt: string;
  text: string;
  status: string;
  resultSummary: string;
  resultLinks: AiLink[];
  processedAt: string | null;
};

export async function listAiInbox(): Promise<AiInboxItem[]> {
  const { data, error } = await supabase.from("ai_inbox").select("id, created_at, text, status, result_summary, result_links, processed_at").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    createdAt: text(row.created_at),
    text: text(row.text),
    status: text(row.status),
    resultSummary: text(row.result_summary),
    resultLinks: Array.isArray(row.result_links)
      ? (row.result_links as Raw[]).map((link) => ({
          section: text(link.section),
          id: text(link.id),
          label: text(link.label),
        }))
      : [],
    processedAt: text(row.processed_at) || null,
  }));
}

export async function sendAiInbox(textBody: string): Promise<void> {
  const body = textBody.trim();
  if (!body) throw new AppError("文章を入力してください。");
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase.from("ai_inbox").insert({
    text: body,
    status: "未処理",
    created_by: sessionData.session?.user.id ?? null,
  });
  if (error) throw error;
}

export async function createEstimateForInquiry(inquiry: InquiryRow): Promise<string> {
  const issueDate = todayISO();
  const id = await saveEstimate({
    estimateNo: await suggestEstimateNo(),
    customerId: inquiry.customerId,
    newCustomer: null,
    siteName: inquiry.siteName,
    title: inquiry.siteName,
    issueDate,
    validUntil: addDaysISO(issueDate, 30),
    status: "draft",
    notes: [inquiry.details, inquiry.notes].filter((line) => line.trim()).join("\n"),
    taxPercent: 10,
    lines: [],
  });
  const { error } = await supabase.from("estimates").update({ inquiry_id: inquiry.id }).eq("id", id);
  if (error) throw error;
  await updateInquiryStatus(inquiry.id, "見積中");
  return id;
}

export async function saveJob(input: {
  id: string;
  customerId: string | null;
  title: string;
  siteName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phase: JobPhase;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  notes: string;
  days: JobDay[];
  costs: JobCost[];
}): Promise<void> {
  const siteName = input.siteName.trim() || input.title.trim();
  if (!siteName) throw new AppError("現場名を入力してください。");
  const progress = Math.max(0, Math.min(100, Math.round(input.progress)));
  const { error } = await supabase
    .from("jobs")
    .update({
      customer_id: input.customerId,
      title: siteName,
      site_name: siteName,
      address: textOrNull(input.address),
      latitude: input.latitude,
      longitude: input.longitude,
      phase: input.phase,
      start_date: input.startDate,
      end_date: input.endDate,
      progress,
      notes: textOrNull(input.notes),
    })
    .eq("id", input.id);
  if (error) throw error;
  const days = input.days
    .filter((day) => day.workContent.trim() || day.workDate || day.paint.trim() || day.assignee.trim())
    .map((day, index) => ({
      ...(day.id ? { id: day.id } : {}),
      job_id: input.id,
      work_date: textOrNull(day.workDate),
      work_content: day.workContent.trim() || "（作業内容未記入）",
      paint: textOrNull(day.paint),
      assignee: textOrNull(day.assignee),
      hours: Math.max(0, asNumber(day.hours)),
      sort: index,
    }));
  await syncChildRows("job_days", "job_id", input.id, days);
  const costs = input.costs
    .filter((cost) => cost.label.trim())
    .map((cost, index) => ({
      ...(cost.id ? { id: cost.id } : {}),
      job_id: input.id,
      category: cost.category,
      label: cost.label.trim(),
      amount: Math.max(0, Math.round(asNumber(cost.amount))),
      cost_date: textOrNull(cost.costDate),
      sort: index,
    }));
  await syncChildRows("job_costs", "job_id", input.id, costs);
}

export async function deleteJob(id: string): Promise<void> {
  const photos = await listPhotos(id);
  if (photos.length > 0) await supabase.storage.from("site-photos").remove(photos.map((photo) => photo.storagePath));
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw error;
}

export async function listTrips(): Promise<
  { id: string; title: string; departOn: string | null; returnOn: string | null; lodging: string; jobTitle: string; awaitingConfirmation: boolean }[]
> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, depart_on, return_on, lodging, awaiting_confirmation, jobs(title)")
    .order("depart_on", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    title: text(row.title),
    departOn: text(row.depart_on) || null,
    returnOn: text(row.return_on) || null,
    lodging: text(row.lodging),
    jobTitle: text(one(row.jobs)?.title),
    awaitingConfirmation: row.awaiting_confirmation === true,
  }));
}

export async function getTrip(id: string): Promise<TripDetail | null> {
  const { data, error } = await supabase.from("trips").select("*, trip_checks(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Raw;
  const checks = (Array.isArray(row.trip_checks) ? row.trip_checks : [])
    .map((item) => item as Raw)
    .sort((a, b) => asNumber(a.sort) - asNumber(b.sort))
    .map((item) => ({ id: text(item.id), key: text(item.id), label: text(item.label), done: item.done === true }));
  return {
    id: text(row.id),
    jobId: text(row.job_id) || null,
    title: text(row.title),
    departOn: text(row.depart_on) || null,
    returnOn: text(row.return_on) || null,
    lodging: text(row.lodging),
    travelNotes: text(row.travel_notes),
    notes: text(row.notes),
    partySize: Math.max(1, asNumber(row.party_size) || 1),
    siteAddress: text(row.site_address),
    hotelName: text(row.hotel_name),
    reservationNo: text(row.reservation_no),
    lodgingPrice: row.lodging_price == null ? "" : String(asNumber(row.lodging_price)),
    checkIn: text(row.check_in) || null,
    checkOut: text(row.check_out) || null,
    awaitingConfirmation: row.awaiting_confirmation === true,
    checks,
  };
}

export async function createTrip(title: string): Promise<string> {
  if (!title.trim()) throw new AppError("出張名を入力してください。");
  const { data, error } = await supabase.from("trips").insert({ title: title.trim() }).select("id").single();
  if (error) throw error;
  return text((data as Raw).id);
}

export async function saveTrip(input: TripDetail): Promise<void> {
  if (!input.title.trim()) throw new AppError("出張名を入力してください。");
  const { error } = await supabase
    .from("trips")
    .update({
      job_id: input.jobId,
      title: input.title.trim(),
      depart_on: input.departOn,
      return_on: input.returnOn,
      lodging: textOrNull(input.lodging),
      travel_notes: textOrNull(input.travelNotes),
      notes: textOrNull(input.notes),
      party_size: Math.max(1, Math.min(30, Math.round(input.partySize || 1))),
      site_address: textOrNull(input.siteAddress),
      hotel_name: textOrNull(input.hotelName),
      reservation_no: textOrNull(input.reservationNo),
      lodging_price: input.lodgingPrice.trim() ? Math.max(0, Math.round(asNumber(input.lodgingPrice))) : null,
      check_in: input.checkIn,
      check_out: input.checkOut,
    })
    .eq("id", input.id);
  if (error) throw error;
  const checks = input.checks
    .filter((item) => item.label.trim())
    .map((item, index) => ({
      ...(item.id ? { id: item.id } : {}),
      trip_id: input.id,
      label: item.label.trim(),
      done: item.done,
      sort: index,
    }));
  await syncChildRows("trip_checks", "trip_id", input.id, checks);
}

export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw error;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*, customers(name), jobs(title)")
    .order("due_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    customerId: text(row.customer_id) || null,
    customerName: text(one(row.customers)?.name),
    jobId: text(row.job_id) || null,
    jobTitle: text(one(row.jobs)?.title),
    title: text(row.title),
    docKind: isDocKind(row.doc_kind) ? row.doc_kind : "その他",
    status: isDocStatus(row.status) ? row.status : "missing",
    dueOn: text(row.due_on) || null,
    notes: text(row.notes),
    storagePath: text(row.storage_path),
    awaitingConfirmation: row.awaiting_confirmation === true,
  }));
}

export async function saveDocument(input: {
  id?: string;
  customerId: string | null;
  jobId: string | null;
  title: string;
  docKind: DocKind;
  status: DocStatus;
  dueOn: string;
  notes: string;
}): Promise<string> {
  if (!input.title.trim()) throw new AppError("書類名を入力してください。");
  const payload = {
    customer_id: input.customerId,
    job_id: input.jobId,
    title: input.title.trim(),
    doc_kind: input.docKind,
    status: input.status,
    due_on: textOrNull(input.dueOn),
    notes: textOrNull(input.notes),
  };
  if (input.id) {
    const { error } = await supabase.from("documents").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from("documents").insert(payload).select("id").single();
  if (error) throw error;
  return text((data as Raw).id);
}

export async function uploadDocumentFile(id: string, file: File): Promise<void> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw uploadError;
  const { data: current, error: readError } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  if (readError) throw readError;
  const previous = text((current as Raw).storage_path);
  const { error } = await supabase.from("documents").update({ storage_path: path }).eq("id", id);
  if (error) throw error;
  if (previous) await supabase.storage.from("documents").remove([previous]);
}

export async function documentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw error ?? new AppError("ファイルを開けませんでした。");
  return data.signedUrl;
}

export async function deleteDocument(row: DocumentRow): Promise<void> {
  if (row.storagePath) await supabase.storage.from("documents").remove([row.storagePath]);
  const { error } = await supabase.from("documents").delete().eq("id", row.id);
  if (error) throw error;
}

export async function suggestInvoiceNo(date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const { data, error } = await supabase.from("invoices").select("invoice_no").like("invoice_no", `${prefix}%`);
  if (error) throw error;
  let max = 0;
  const pattern = new RegExp(`^INV-${year}-(\\d+)$`);
  for (const row of (data ?? []) as Raw[]) {
    const match = pattern.exec(text(row.invoice_no));
    if (!match?.[1]) continue;
    max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function mapInvoice(row: Raw, lines: InvoiceLine[] = []): InvoiceDetail {
  return {
    id: text(row.id),
    invoiceNo: text(row.invoice_no),
    estimateId: text(row.estimate_id) || null,
    jobId: text(row.job_id) || null,
    customerId: text(row.customer_id) || null,
    customerName: text(one(row.customers)?.name),
    siteName: text(row.site_name),
    title: text(row.title),
    issueDate: text(row.issue_date) || null,
    dueOn: text(row.due_on) || null,
    status: isInvoiceStatus(row.status) ? row.status : "draft",
    notes: text(row.notes),
    subtotal: asNumber(row.subtotal),
    taxRate: asNumber(row.tax_rate),
    tax: asNumber(row.tax),
    total: asNumber(row.total),
    awaitingConfirmation: row.awaiting_confirmation === true,
    lines,
  };
}

export async function listInvoices(): Promise<InvoiceDetail[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_no, estimate_id, job_id, customer_id, site_name, title, issue_date, due_on, status, notes, subtotal, tax_rate, tax, total, awaiting_confirmation, customers(name)")
    .order("issue_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => mapInvoice(row));
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, customers(name), invoice_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Raw;
  const lines = (Array.isArray(row.invoice_items) ? row.invoice_items : [])
    .map((item) => item as Raw)
    .sort((a, b) => asNumber(a.sort) - asNumber(b.sort))
    .map((item) => ({
      id: text(item.id),
      key: text(item.id),
      itemName: text(item.item_name),
      spec: text(item.spec),
      quantity: String(asNumber(item.quantity)),
      unit: text(item.unit),
      unitPrice: String(asNumber(item.unit_price)),
    }));
  return mapInvoice(row, lines.length > 0 ? lines : [{ key: blankKey(), itemName: "", spec: "", quantity: "1", unit: "㎡", unitPrice: "0" }]);
}

export async function saveInvoice(input: {
  id?: string;
  invoiceNo: string;
  estimateId: string | null;
  jobId: string | null;
  customerId: string | null;
  siteName: string;
  title: string;
  issueDate: string;
  dueOn: string;
  status: InvoiceStatus;
  notes: string;
  taxPercent: number;
  lines: { id?: string; itemName: string; spec: string; quantity: number; unit: string; unitPrice: number }[];
}): Promise<string> {
  const invoiceNo = input.invoiceNo.trim();
  if (!invoiceNo) throw new AppError("請求番号を入力してください。");
  const taxRate = percentToRate(input.taxPercent);
  const totals = summarize(input.lines, taxRate);
  const payload = {
    invoice_no: invoiceNo,
    estimate_id: input.estimateId,
    job_id: input.jobId,
    customer_id: input.customerId,
    site_name: textOrNull(input.siteName),
    title: textOrNull(input.title),
    issue_date: textOrNull(input.issueDate),
    due_on: textOrNull(input.dueOn),
    status: input.status,
    notes: textOrNull(input.notes),
    subtotal: totals.subtotal,
    tax_rate: taxRate,
    tax: totals.tax,
    total: totals.total,
  };
  let id = input.id;
  if (!id) {
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("invoices")
      .insert({ ...payload, created_by: sessionData.session?.user.id ?? null })
      .select("id")
      .single();
    if (error) throw error;
    id = text((data as Raw).id);
  } else {
    const { error } = await supabase.from("invoices").update(payload).eq("id", id);
    if (error) throw error;
  }
  const rows = input.lines.map((line, index) => {
    const quantity = normalizeQuantity(line.quantity);
    const unitPrice = Math.round(line.unitPrice);
    return {
      ...(line.id ? { id: line.id } : {}),
      invoice_id: id,
      sort: index,
      item_name: line.itemName.trim(),
      spec: textOrNull(line.spec),
      quantity,
      unit: textOrNull(line.unit),
      unit_price: unitPrice,
      amount: lineAmount(quantity, unitPrice),
    };
  });
  await syncChildRows("invoice_items", "invoice_id", id, rows);
  return id;
}

export async function createInvoiceFromEstimate(estimateId: string): Promise<string> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) throw new AppError("見積が見つかりません。");
  const { data: estimateRow, error: estimateError } = await supabase.from("estimates").select("job_id").eq("id", estimateId).single();
  if (estimateError) throw estimateError;
  const issueDate = todayISO();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueOn = todayISO(due);
  return saveInvoice({
    invoiceNo: await suggestInvoiceNo(),
    estimateId,
    jobId: text((estimateRow as Raw).job_id) || null,
    customerId: estimate.customerId,
    siteName: estimate.siteName,
    title: estimate.title,
    issueDate,
    dueOn,
    status: "draft",
    notes: estimate.notes,
    taxPercent: Math.round(estimate.taxRate * 10000) / 100,
    lines: estimate.items.map((item) => ({
      itemName: item.itemName,
      spec: item.spec,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
    })),
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

export async function listPhotos(jobId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabase.from("site_photos").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    jobId: text(row.job_id),
    stage: isPhotoStage(row.stage) ? row.stage : "other",
    caption: text(row.caption),
    storagePath: text(row.storage_path),
    takenOn: text(row.taken_on) || null,
    url: "",
  }));
  if (rows.length === 0) return rows;
  const { data: signed, error: signError } = await supabase.storage.from("site-photos").createSignedUrls(
    rows.map((row) => row.storagePath),
    60 * 60,
  );
  if (signError) throw signError;
  const urls = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
  return rows.map((row) => ({ ...row, url: urls.get(row.storagePath) ?? "" }));
}

export async function uploadPhoto(input: { jobId: string; stage: PhotoStage; caption: string; file: Blob; takenOn: string }): Promise<void> {
  const path = `${input.jobId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("site-photos").upload(path, input.file, { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("site_photos").insert({
    job_id: input.jobId,
    stage: input.stage,
    caption: textOrNull(input.caption),
    storage_path: path,
    taken_on: textOrNull(input.takenOn),
  });
  if (error) {
    await supabase.storage.from("site-photos").remove([path]);
    throw error;
  }
}

export async function deletePhoto(photo: SitePhoto): Promise<void> {
  await supabase.storage.from("site-photos").remove([photo.storagePath]);
  const { error } = await supabase.from("site_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

export async function setReview(table: "estimates" | "invoices" | "documents" | "trips", id: string, pending: boolean): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ awaiting_confirmation: pending, confirmed_at: pending ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listInbox(): Promise<InboxItem[]> {
  const [estimates, invoices, documents, trips] = await Promise.all([
    supabase.from("estimates").select("id, estimate_no, title, site_name").eq("awaiting_confirmation", true),
    supabase.from("invoices").select("id, invoice_no, title, site_name").eq("awaiting_confirmation", true),
    supabase.from("documents").select("id, title, doc_kind").eq("awaiting_confirmation", true),
    supabase.from("trips").select("id, title, lodging").eq("awaiting_confirmation", true),
  ]);
  if (estimates.error) throw estimates.error;
  if (invoices.error) throw invoices.error;
  if (documents.error) throw documents.error;
  if (trips.error) throw trips.error;
  const items: InboxItem[] = [];
  for (const row of (estimates.data ?? []) as Raw[]) {
    items.push({
      id: text(row.id),
      kind: "estimate",
      kindLabel: "見積",
      title: text(row.estimate_no),
      detail: text(row.title) || text(row.site_name) || "件名未設定",
      href: `/estimates/${text(row.id)}`,
    });
  }
  for (const row of (invoices.data ?? []) as Raw[]) {
    items.push({
      id: text(row.id),
      kind: "invoice",
      kindLabel: "請求",
      title: text(row.invoice_no),
      detail: text(row.title) || text(row.site_name) || "件名未設定",
      href: `/invoices/${text(row.id)}`,
    });
  }
  for (const row of (documents.data ?? []) as Raw[]) {
    items.push({
      id: text(row.id),
      kind: "document",
      kindLabel: "書類",
      title: text(row.title),
      detail: text(row.doc_kind),
      href: "/documents",
    });
  }
  for (const row of (trips.data ?? []) as Raw[]) {
    items.push({
      id: text(row.id),
      kind: "trip",
      kindLabel: "出張",
      title: text(row.title),
      detail: text(row.lodging) || "宿泊メモ",
      href: `/trips/${text(row.id)}`,
    });
  }
  return items;
}

export async function salesRows(): Promise<
  { id: string; title: string; siteName: string; revenue: number; draftRevenue: number; cost: number }[]
> {
  const [jobs, invoices, costs] = await Promise.all([
    supabase.from("jobs").select("id, title, site_name").order("title"),
    supabase.from("invoices").select("job_id, status, total"),
    supabase.from("job_costs").select("job_id, amount"),
  ]);
  if (jobs.error) throw jobs.error;
  if (invoices.error) throw invoices.error;
  if (costs.error) throw costs.error;
  const revenue = new Map<string, number>();
  const draft = new Map<string, number>();
  for (const row of (invoices.data ?? []) as Raw[]) {
    const jobId = text(row.job_id);
    if (!jobId || row.status === "void") continue;
    const amount = asNumber(row.total);
    if (row.status === "draft") draft.set(jobId, (draft.get(jobId) ?? 0) + amount);
    if (row.status === "sent" || row.status === "paid") revenue.set(jobId, (revenue.get(jobId) ?? 0) + amount);
  }
  const cost = new Map<string, number>();
  for (const row of (costs.data ?? []) as Raw[]) {
    const jobId = text(row.job_id);
    cost.set(jobId, (cost.get(jobId) ?? 0) + asNumber(row.amount));
  }
  return ((jobs.data ?? []) as Raw[]).map((row) => {
    const id = text(row.id);
    return {
      id,
      title: text(row.title),
      siteName: text(row.site_name),
      revenue: revenue.get(id) ?? 0,
      draftRevenue: draft.get(id) ?? 0,
      cost: cost.get(id) ?? 0,
    };
  });
}

export type OutboundMessage = {
  id: string;
  toEmail: string;
  status: "sent" | "failed" | "not_configured";
  hasAttachment: boolean;
  createdAt: string;
};

export async function listOutboundMessages(kind: string, refId: string): Promise<OutboundMessage[]> {
  const { data, error } = await supabase
    .from("outbound_messages")
    .select("id, to_email, status, has_attachment, created_at")
    .eq("kind", kind)
    .eq("ref_id", refId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    toEmail: text(row.to_email),
    status: row.status === "sent" || row.status === "failed" || row.status === "not_configured" ? row.status : "failed",
    hasAttachment: row.has_attachment === true,
    createdAt: text(row.created_at),
  }));
}

export type SalesPoint = { date: string; jobId: string; jobTitle: string; revenue: number; cost: number };

export async function salesPoints(): Promise<SalesPoint[]> {
  const [invoices, costs, jobs] = await Promise.all([
    supabase.from("invoices").select("job_id, status, total, issue_date"),
    supabase.from("job_costs").select("job_id, amount, cost_date"),
    supabase.from("jobs").select("id, title"),
  ]);
  if (invoices.error) throw invoices.error;
  if (costs.error) throw costs.error;
  if (jobs.error) throw jobs.error;
  const titles = new Map(((jobs.data ?? []) as Raw[]).map((row) => [text(row.id), text(row.title)]));
  const points: SalesPoint[] = [];
  for (const row of (invoices.data ?? []) as Raw[]) {
    if (row.status !== "sent" && row.status !== "paid") continue;
    const date = text(row.issue_date);
    if (!date) continue;
    const jobId = text(row.job_id);
    points.push({ date, jobId, jobTitle: titles.get(jobId) || "案件未設定", revenue: asNumber(row.total), cost: 0 });
  }
  for (const row of (costs.data ?? []) as Raw[]) {
    const date = text(row.cost_date);
    if (!date) continue;
    const jobId = text(row.job_id);
    points.push({ date, jobId, jobTitle: titles.get(jobId) || "案件未設定", revenue: 0, cost: asNumber(row.amount) });
  }
  return points;
}

export async function listEstimateChoices(): Promise<{ id: string; label: string }[]> {
  const { data, error } = await supabase.from("estimates").select("id, estimate_no, title").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    label: `${text(row.estimate_no)} ${text(row.title)}`.trim(),
  }));
}

export async function linkEstimate(estimateId: string, jobId: string | null): Promise<void> {
  const { error } = await supabase.from("estimates").update({ job_id: jobId }).eq("id", estimateId);
  if (error) throw error;
}

export async function estimatesForJob(jobId: string): Promise<{ id: string; estimateNo: string; title: string; total: number }[]> {
  const { data, error } = await supabase.from("estimates").select("id, estimate_no, title, total").eq("job_id", jobId);
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((row) => ({
    id: text(row.id),
    estimateNo: text(row.estimate_no),
    title: text(row.title),
    total: asNumber(row.total),
  }));
}

export async function seedFiction(): Promise<void> {
  const { data: existing, error: existingError } = await supabase.from("customers").select("id").eq("notes", FICTION_MARK).limit(1);
  if (existingError) throw existingError;
  if ((existing ?? []).length > 0) throw new AppError("架空の見本はすでに入っています。");
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({ name: "架空）青葉商事株式会社", contact: "架空の担当", address: "架空の住所", notes: FICTION_MARK })
    .select("id")
    .single();
  if (customerError) throw customerError;
  const customerId = text((customer as Raw).id);
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: customerId,
      title: "架空）外壁塗装工事",
      site_name: "架空）山田邸",
      address: "横浜市中区（架空）",
      latitude: 35.4478,
      longitude: 139.6425,
      phase: "active",
      start_date: todayISO(),
      end_date: todayISO(new Date(Date.now() + 2 * 86400000)),
      progress: 40,
      notes: FICTION_MARK,
    })
    .select("id")
    .single();
  if (jobError) throw jobError;
  const jobId = text((job as Raw).id);
  const { error: dayError } = await supabase.from("job_days").insert([
    { job_id: jobId, work_date: todayISO(), work_content: "架空）下塗り", paint: "架空）シーラー", assignee: "架空）佐藤", hours: 6, sort: 0 },
    { job_id: jobId, work_date: todayISO(new Date(Date.now() + 86400000)), work_content: "架空）上塗り1回目", paint: "架空）シリコン", assignee: "架空）佐藤", hours: 7, sort: 1 },
  ]);
  if (dayError) throw dayError;
  const { error: costError } = await supabase.from("job_costs").insert([
    { job_id: jobId, category: "材料", label: "架空）塗料", amount: 80000, cost_date: todayISO(), sort: 0 },
    { job_id: jobId, category: "交通", label: "架空）交通費", amount: 8400, cost_date: todayISO(new Date(Date.now() - 8 * 86400000)), sort: 1 },
  ]);
  if (costError) throw costError;
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .insert({
      job_id: jobId,
      title: "架空）山田邸への出張",
      depart_on: todayISO(),
      return_on: todayISO(new Date(Date.now() + 2 * 86400000)),
      lodging: "架空）ホテル見本",
      site_address: "横浜市中区（架空）",
      party_size: 2,
      check_in: todayISO(),
      check_out: todayISO(new Date(Date.now() + 2 * 86400000)),
      hotel_name: "",
      travel_notes: "架空）社用車。予約サイトを開くだけで、この画面は予約しない",
      notes: FICTION_MARK,
      awaiting_confirmation: true,
    })
    .select("id")
    .single();
  if (tripError) throw tripError;
  const { error: checkError } = await supabase.from("trip_checks").insert([
    { trip_id: text((trip as Raw).id), label: "架空）ローラー", done: true, sort: 0 },
    { trip_id: text((trip as Raw).id), label: "架空）養生テープ", done: false, sort: 1 },
  ]);
  if (checkError) throw checkError;
  const { error: docError } = await supabase.from("documents").insert({
    customer_id: customerId,
    job_id: jobId,
    title: "架空）外壁塗装の注文書",
    doc_kind: "注文書",
    status: "soon",
    due_on: todayISO(new Date(Date.now() + 7 * 86400000)),
    notes: FICTION_MARK,
    awaiting_confirmation: true,
  });
  if (docError) throw docError;
  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .insert({
      estimate_no: `架空-EST-${Date.now()}`,
      customer_id: customerId,
      job_id: jobId,
      site_name: "架空）山田邸",
      title: "架空）外壁塗装",
      issue_date: todayISO(),
      status: "accepted",
      notes: FICTION_MARK,
      subtotal: 200000,
      tax_rate: 0.1,
      tax: 20000,
      total: 220000,
      awaiting_confirmation: true,
    })
    .select("id")
    .single();
  if (estimateError) throw estimateError;
  const estimateId = text((estimate as Raw).id);
  const { error: itemError } = await supabase.from("estimate_items").insert({
    estimate_id: estimateId,
    sort: 0,
    item_name: "架空）外壁塗装",
    spec: "架空）シリコン",
    quantity: 100,
    unit: "㎡",
    unit_price: 2000,
    amount: 200000,
  });
  if (itemError) throw itemError;
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_no: `架空-INV-${Date.now()}`,
      estimate_id: estimateId,
      job_id: jobId,
      customer_id: customerId,
      site_name: "架空）山田邸",
      title: "架空）外壁塗装",
      issue_date: todayISO(),
      due_on: todayISO(new Date(Date.now() + 30 * 86400000)),
      status: "sent",
      notes: FICTION_MARK,
      subtotal: 200000,
      tax_rate: 0.1,
      tax: 20000,
      total: 220000,
      awaiting_confirmation: true,
    })
    .select("id")
    .single();
  if (invoiceError) throw invoiceError;
  const { error: invoiceItemError } = await supabase.from("invoice_items").insert({
    invoice_id: text((invoice as Raw).id),
    sort: 0,
    item_name: "架空）外壁塗装",
    spec: "架空）シリコン",
    quantity: 100,
    unit: "㎡",
    unit_price: 2000,
    amount: 200000,
  });
  if (invoiceItemError) throw invoiceItemError;
  const blob = await fictionJpeg();
  await uploadPhoto({ jobId, stage: "undercoat", caption: "架空）下塗りの見本", file: blob, takenOn: todayISO() });
}

export async function clearFiction(): Promise<void> {
  const { data: customers, error } = await supabase.from("customers").select("id").eq("notes", FICTION_MARK);
  if (error) throw error;
  const customerIds = ((customers ?? []) as Raw[]).map((row) => text(row.id));
  const { data: jobs, error: jobError } = await supabase.from("jobs").select("id").eq("notes", FICTION_MARK);
  if (jobError) throw jobError;
  for (const row of (jobs ?? []) as Raw[]) {
    const photos = await listPhotos(text(row.id));
    if (photos.length > 0) await supabase.storage.from("site-photos").remove(photos.map((photo) => photo.storagePath));
  }
  const { data: docs, error: docError } = await supabase.from("documents").select("id, storage_path").eq("notes", FICTION_MARK);
  if (docError) throw docError;
  const paths = ((docs ?? []) as Raw[]).map((row) => text(row.storage_path)).filter(Boolean);
  if (paths.length > 0) await supabase.storage.from("documents").remove(paths);
  if (customerIds.length > 0) {
    const { error: invoiceError } = await supabase.from("invoices").delete().in("customer_id", customerIds);
    if (invoiceError) throw invoiceError;
    const { error: estimateError } = await supabase.from("estimates").delete().in("customer_id", customerIds);
    if (estimateError) throw estimateError;
  }
  const { error: tripError } = await supabase.from("trips").delete().eq("notes", FICTION_MARK);
  if (tripError) throw tripError;
  const { error: documentDeleteError } = await supabase.from("documents").delete().eq("notes", FICTION_MARK);
  if (documentDeleteError) throw documentDeleteError;
  const { error: jobsDeleteError } = await supabase.from("jobs").delete().eq("notes", FICTION_MARK);
  if (jobsDeleteError) throw jobsDeleteError;
  if (customerIds.length > 0) {
    const { error: customerDeleteError } = await supabase.from("customers").delete().in("id", customerIds);
    if (customerDeleteError) throw customerDeleteError;
  }
}

async function fictionJpeg(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) throw new AppError("見本画像を作れませんでした。");
  context.fillStyle = "#111111";
  context.fillRect(0, 0, 640, 360);
  context.fillStyle = "#FACC15";
  context.fillRect(0, 0, 640, 28);
  context.fillRect(0, 332, 640, 28);
  context.fillStyle = "#111111";
  context.font = "bold 28px sans-serif";
  context.fillText("架空の見本", 24, 24);
  context.fillStyle = "#FACC15";
  context.font = "bold 36px sans-serif";
  context.fillText("下塗り（架空）", 36, 180);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new AppError("見本画像を作れませんでした。");
  return blob;
}
