export function FictionNote({ text }: { text: string }) {
  if (!text.includes("架空")) return null;
  return <p className="fiction">架空の見本です。実在の顧客・金額ではありません。</p>;
}
