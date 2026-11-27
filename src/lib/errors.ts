export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const record = typeof error === "object" && error ? (error as { code?: unknown; message?: unknown }) : null;
  const code = record ? String(record.code ?? "") : "";
  const message = record ? String(record.message ?? "") : error instanceof Error ? error.message : "";
  console.error(error);
  if (code === "23505" || message.includes("estimates_estimate_no_key")) {
    return "この見積番号はすでに使われています。別の番号にしてください。";
  }
  if (code === "23503") {
    return "この得意先を使っている見積があるため削除できません。";
  }
  const lower = message.toLowerCase();
  if (code === "42501" || lower.includes("permission") || lower.includes("jwt") || lower.includes("row-level")) {
    return "権限がありません。一度ログアウトして、ログインし直してください。";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "通信できませんでした。電波の状態を確認して、もう一度お試しください。";
  }
  return "処理に失敗しました。しばらくしてからもう一度お試しください。";
}

export function loginErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (lower.includes("email not confirmed")) {
    return "メールアドレスの確認が終わっていません。招待メールをご確認ください。";
  }
  if (lower.includes("too many") || lower.includes("rate limit")) {
    return "試行が多すぎます。しばらくしてからもう一度お試しください。";
  }
  return "ログインできませんでした。入力内容と通信状況をご確認ください。";
}
