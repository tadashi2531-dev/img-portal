export function normalizeQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function lineAmount(quantity: number, unitPrice: number): number {
  return Math.round(normalizeQuantity(quantity) * Math.round(unitPrice));
}

export function percentToRate(percent: number): number {
  return Math.round(percent * 100) / 10000;
}

export function rateToPercentInput(rate: number): string {
  const percent = Math.round(rate * 10000) / 100;
  return String(percent);
}

export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export function formatPercentLabel(rate: number): string {
  const percent = Math.round(rate * 10000) / 100;
  return `${percent}%`;
}

export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseYen(value: string): number | null {
  const parsed = parseDecimal(value);
  if (parsed == null) return null;
  return Math.round(parsed);
}

export function parsePercent(value: string): number | null {
  const parsed = parseDecimal(value);
  if (parsed == null || parsed > 100) return null;
  return parsed;
}

export function summarize(
  lines: { quantity: number; unitPrice: number }[],
  taxRate: number,
): { subtotal: number; tax: number; total: number } {
  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.unitPrice), 0);
  const tax = Math.round(subtotal * taxRate);
  return { subtotal, tax, total: subtotal + tax };
}

export function todayISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year || 1970, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function formatDateJa(iso: string | null | undefined): string {
  if (!iso) return "未設定";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
