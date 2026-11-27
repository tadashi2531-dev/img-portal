import { STATUS_LABEL, type EstimateStatus } from "../lib/types.ts";

export function StatusPill({ status }: { status: EstimateStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}
