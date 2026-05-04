import type { ServerStatus } from '@homelab/shared';

const STYLE: Record<ServerStatus, string> = {
  online: 'text-green border-green',
  degraded: 'text-amber border-amber',
  offline: 'text-red border-red',
};

export function StatusBadge({ status }: { status: ServerStatus }) {
  return (
    <span className={`text-[11px] px-1.5 py-px border tracking-widest ${STYLE[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}
