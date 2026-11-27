export function SalesChart({
  buckets,
}: {
  buckets: { label: string; revenue: number; cost: number; profit: number }[];
}) {
  if (buckets.length === 0) return <p className="fine">この期間の数字はまだありません。</p>;
  const width = 640;
  const height = 220;
  const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.revenue, bucket.cost, Math.abs(bucket.profit)]));
  const groupWidth = width / buckets.length;
  const barWidth = Math.min(18, groupWidth / 4);
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height + 36}`} role="img" aria-label="売上と粗利のグラフ">
      <line x1="0" y1={height} x2={width} y2={height} stroke="#3f3f46" />
      {buckets.map((bucket, index) => {
        const x = index * groupWidth + groupWidth / 2;
        const revenueHeight = (bucket.revenue / max) * (height - 12);
        const costHeight = (bucket.cost / max) * (height - 12);
        const profitHeight = (Math.abs(bucket.profit) / max) * (height - 12);
        return (
          <g key={bucket.label}>
            <rect x={x - barWidth * 1.6} y={height - revenueHeight} width={barWidth} height={revenueHeight} fill="#FACC15" />
            <rect x={x - barWidth * 0.5} y={height - costHeight} width={barWidth} height={costHeight} fill="#52525b" />
            <rect x={x + barWidth * 0.6} y={height - profitHeight} width={barWidth} height={profitHeight} fill={bucket.profit < 0 ? "#fca5a5" : "#86efac"} />
            <text x={x} y={height + 22} textAnchor="middle" fill="#a1a1aa" fontSize="12">
              {bucket.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
