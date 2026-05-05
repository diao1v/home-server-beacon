import type { DisplayStatus } from '../lib/format';

const STYLE: Record<DisplayStatus, string> = {
  waiting: 'text-muted border-muted',
  online: 'text-green border-green',
  degraded: 'text-amber border-amber',
  offline: 'text-red border-red',
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`text-[11px] px-1.5 py-px border tracking-widest ${STYLE[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}
