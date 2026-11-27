export type JobPhase = "plan" | "active" | "done";
export type PhotoStage = "undercoat" | "top1" | "top2" | "finished" | "other";
export type DocKind = "注文書" | "契約書" | "入館申請" | "その他";
export type DocStatus = "missing" | "pending" | "active" | "soon";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type CostCategory = "人件費" | "材料" | "外注" | "交通" | "その他";

export const JOB_PHASES: JobPhase[] = ["plan", "active", "done"];
export const PHASE_LABEL: Record<JobPhase, string> = { plan: "予定", active: "実行", done: "完了" };
export const PHOTO_STAGES: PhotoStage[] = ["undercoat", "top1", "top2", "finished", "other"];
export const STAGE_LABEL: Record<PhotoStage, string> = {
  undercoat: "下塗り",
  top1: "上塗り1回目",
  top2: "上塗り2回目",
  finished: "塗り終わり",
  other: "その他",
};
export const DOC_KINDS: DocKind[] = ["注文書", "契約書", "入館申請", "その他"];
export const DOC_STATUSES: DocStatus[] = ["missing", "pending", "active", "soon"];
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  missing: "未提出",
  pending: "確認待ち",
  active: "有効",
  soon: "期限が近い",
};
export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "void"];
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "下書き",
  sent: "提出済み",
  paid: "入金済",
  void: "取消",
};
export const COST_CATEGORIES: CostCategory[] = ["人件費", "材料", "外注", "交通", "その他"];

export function isJobPhase(value: unknown): value is JobPhase {
  return value === "plan" || value === "active" || value === "done";
}
export function isPhotoStage(value: unknown): value is PhotoStage {
  return PHOTO_STAGES.some((stage) => stage === value);
}
export function isDocKind(value: unknown): value is DocKind {
  return DOC_KINDS.some((kind) => kind === value);
}
export function isDocStatus(value: unknown): value is DocStatus {
  return DOC_STATUSES.some((status) => status === value);
}
export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return INVOICE_STATUSES.some((status) => status === value);
}
export function isCostCategory(value: unknown): value is CostCategory {
  return COST_CATEGORIES.some((category) => category === value);
}

export type JobDay = {
  id?: string;
  key: string;
  workDate: string;
  workContent: string;
  paint: string;
  assignee: string;
  hours: string;
};

export type JobCost = {
  id?: string;
  key: string;
  category: CostCategory;
  label: string;
  amount: string;
  costDate: string;
};

export type JobDetail = {
  id: string;
  customerId: string | null;
  customerName: string;
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
};

export type TripCheck = { id?: string; key: string; label: string; done: boolean };

export type TripDetail = {
  id: string;
  jobId: string | null;
  title: string;
  departOn: string | null;
  returnOn: string | null;
  lodging: string;
  travelNotes: string;
  notes: string;
  partySize: number;
  siteAddress: string;
  hotelName: string;
  reservationNo: string;
  lodgingPrice: string;
  checkIn: string | null;
  checkOut: string | null;
  awaitingConfirmation: boolean;
  checks: TripCheck[];
};

export type DocumentRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  jobId: string | null;
  jobTitle: string;
  title: string;
  docKind: DocKind;
  status: DocStatus;
  dueOn: string | null;
  notes: string;
  storagePath: string;
  awaitingConfirmation: boolean;
};

export type InvoiceLine = {
  id?: string;
  key: string;
  itemName: string;
  spec: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export type InvoiceDetail = {
  id: string;
  invoiceNo: string;
  estimateId: string | null;
  jobId: string | null;
  customerId: string | null;
  customerName: string;
  siteName: string;
  title: string;
  issueDate: string | null;
  dueOn: string | null;
  status: InvoiceStatus;
  notes: string;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  awaitingConfirmation: boolean;
  lines: InvoiceLine[];
};

export type SitePhoto = {
  id: string;
  jobId: string;
  stage: PhotoStage;
  caption: string;
  storagePath: string;
  takenOn: string | null;
  url: string;
};

export type InboxItem = {
  id: string;
  kind: "estimate" | "invoice" | "document" | "trip";
  kindLabel: string;
  title: string;
  detail: string;
  href: string;
};
