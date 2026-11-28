export type PdfDocument = {
  heading: "御見積書" | "御請求書";
  numberLabel: string;
  number: string;
  customer: string;
  title: string;
  site: string;
  dateLabel: string;
  date: string;
  lines: { name: string; spec: string; qty: string; unit: string; price: string; amount: string }[];
  subtotal: string;
  tax: string;
  total: string;
  notes: string;
  issuer?: string;
};

export async function renderDocumentPdf(input: PdfDocument): Promise<Uint8Array> {
  const width = 794;
  const lineHeight = 28;
  const height = Math.max(1120, 520 + input.lines.length * lineHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDFを描けませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111111";
  context.font = "bold 36px sans-serif";
  context.textAlign = "center";
  context.fillText(input.heading, width / 2, 64);
  context.textAlign = "left";
  context.font = "18px sans-serif";
  let y = 120;
  const rows = [
    `${input.customer || "（得意先未設定）"} 御中`,
    `${input.numberLabel}：${input.number}`,
    `件名：${input.title || "未設定"}`,
    `現場名：${input.site || "未設定"}`,
    `${input.dateLabel}：${input.date}`,
    input.issuer || "",
  ];
  for (const row of rows) {
    context.fillText(row, 48, y);
    y += 32;
  }
  y += 12;
  context.font = "bold 16px sans-serif";
  context.fillText("品名 / 仕様 / 数量 / 単位 / 単価 / 金額", 48, y);
  y += 28;
  context.font = "16px sans-serif";
  for (const line of input.lines) {
    const text = `${line.name} ${line.spec}  ${line.qty}${line.unit}  ${line.price}  ${line.amount}`;
    context.fillText(text.slice(0, 70), 48, y);
    y += lineHeight;
  }
  y += 16;
  context.font = "bold 18px sans-serif";
  context.fillText(`小計 ${input.subtotal}`, 48, y);
  y += 30;
  context.fillText(`消費税 ${input.tax}`, 48, y);
  y += 30;
  context.fillText(`合計 ${input.total}`, 48, y);
  y += 40;
  context.font = "16px sans-serif";
  context.fillText(`備考：${(input.notes || "特になし").slice(0, 80)}`, 48, y);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("PDFを描けませんでした。");
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return jpegToPdf(jpeg, width, height);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function jpegToPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number): Uint8Array {
  const pageWidth = 595;
  const pageHeight = Math.max(1, Math.round((pageWidth * pixelHeight) / pixelWidth));
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    cursor += bytes.length;
  };
  const pushText = (value: string) => push(encoder.encode(value));
  pushText("%PDF-1.4\n");
  const startObject = (body: string) => {
    offsets.push(cursor);
    pushText(body);
  };
  startObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");
  startObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  );
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  startObject(`4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  offsets.push(cursor);
  pushText(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  pushText("\nendstream\nendobj\n");
  const xref = cursor;
  let table = `xref\n0 6\n0000000000 65535 f \n`;
  for (let index = 1; index <= 5; index += 1) {
    table += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  table += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  pushText(table);
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}
