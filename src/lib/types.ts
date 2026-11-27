export const ESTIMATE_STATUSES = ["draft", "sent", "accepted", "lost"] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: "下書き",
  sent: "提出済み",
  accepted: "受注",
  lost: "失注",
};

export const UNIT_SUGGESTIONS = ["㎡", "m", "式", "缶", "本", "箇所", "人工", "枚", "セット", "台", "kg", "L"];

export type Customer = {
  id: string;
  name: string;
  contact: string;
  address: string;
  notes: string;
};

export type EstimateItem = {
  id: string;
  sort: number;
  itemName: string;
  spec: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type EstimateListItem = {
  id: string;
  estimateNo: string;
  customerId: string | null;
  customerName: string;
  siteName: string;
  title: string;
  issueDate: string | null;
  validUntil: string | null;
  status: EstimateStatus;
  total: number;
  awaitingConfirmation: boolean;
};

export type EstimateDetail = EstimateListItem & {
  notes: string;
  subtotal: number;
  taxRate: number;
  tax: number;
  items: EstimateItem[];
};

export function isEstimateStatus(value: unknown): value is EstimateStatus {
  return ESTIMATE_STATUSES.some((status) => status === value);
}
