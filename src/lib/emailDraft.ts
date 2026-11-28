import { formatDateJa, formatPercentLabel, formatYen } from "./money.ts";

export type EmailLine = {
  itemName: string;
  spec: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

export function buildEstimateEmail(input: {
  estimateNo: string;
  customerName: string;
  siteName: string;
  title: string;
  issueDate: string | null;
  validUntil: string | null;
  notes: string;
  lines: EmailLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  companyName?: string;
  trade?: string;
}): { subject: string; body: string } {
  const companyName = input.companyName || "弊社";
  const trade = input.trade || "";
  const subjectName = input.title || input.siteName || input.estimateNo;
  const subject = `お見積書のご送付（${subjectName}）`;
  const customer = input.customerName || "ご担当者";
  const lines = input.lines
    .map((line, index) => {
      const spec = line.spec ? `（${line.spec}）` : "";
      const unit = line.unit ? line.unit : "";
      return [
        `${index + 1}. ${line.itemName}${spec}`,
        `   数量 ${line.quantity}${unit} × 単価 ${formatYen(line.unitPrice)} = ${formatYen(line.amount)}`,
      ].join("\n");
    })
    .join("\n");

  const body = [
    `${customer} 御中`,
    "",
    `お世話になっております。${companyName}です。`,
    "",
    "下記の通りお見積書をお送りします。ご確認のほどよろしくお願いいたします。",
    "",
    `見積番号：${input.estimateNo}`,
    `件名：${input.title || "未設定"}`,
    `現場名：${input.siteName || "未設定"}`,
    `発行日：${formatDateJa(input.issueDate)}`,
    `有効期限：${formatDateJa(input.validUntil)}`,
    "",
    "【内訳】",
    lines || "（明細なし）",
    "",
    `小計：${formatYen(input.subtotal)}`,
    `消費税（${formatPercentLabel(input.taxRate)}）：${formatYen(input.tax)}`,
    `合計（税込）：${formatYen(input.total)}`,
    "",
    "【備考】",
    input.notes.trim() || "特になし",
    "",
    companyName,
    trade,
  ].join("\n");

  return { subject, body };
}

export function buildInvoiceEmail(input: {
  invoiceNo: string;
  customerName: string;
  siteName: string;
  title: string;
  issueDate: string | null;
  dueOn: string | null;
  notes: string;
  lines: EmailLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  companyName?: string;
  trade?: string;
}): { subject: string; body: string } {
  const companyName = input.companyName || "弊社";
  const trade = input.trade || "";
  const subjectName = input.title || input.siteName || input.invoiceNo;
  const subject = `請求書のご送付（${subjectName}）`;
  const lines = input.lines
    .map((line, index) => {
      const spec = line.spec ? `（${line.spec}）` : "";
      return `${index + 1}. ${line.itemName}${spec}\n   数量 ${line.quantity}${line.unit} × 単価 ${formatYen(line.unitPrice)} = ${formatYen(line.amount)}`;
    })
    .join("\n");
  const body = [
    `${input.customerName || "ご担当者"} 御中`,
    "",
    `お世話になっております。${companyName}です。`,
    "",
    "下記の通り請求書をお送りします。ご確認のほどよろしくお願いいたします。",
    "",
    `請求番号：${input.invoiceNo}`,
    `件名：${input.title || "未設定"}`,
    `現場名：${input.siteName || "未設定"}`,
    `発行日：${formatDateJa(input.issueDate)}`,
    `支払期限：${formatDateJa(input.dueOn)}`,
    "",
    "【内訳】",
    lines || "（明細なし）",
    "",
    `小計：${formatYen(input.subtotal)}`,
    `消費税（${formatPercentLabel(input.taxRate)}）：${formatYen(input.tax)}`,
    `合計（税込）：${formatYen(input.total)}`,
    "",
    "【備考】",
    input.notes.trim() || "特になし",
    "",
    companyName,
    trade,
  ].join("\n");
  return { subject, body };
}
