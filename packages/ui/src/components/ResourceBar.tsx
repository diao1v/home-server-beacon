import { type BarColor, fmtPercent, makeBar } from '../lib/format';

const COLOR: Record<BarColor, string> = {
  green: 'text-green',
  amber: 'text-amber',
  red: 'text-red',
  muted: 'text-muted',
};

export function ResourceBar({ label, value }: { label: string; value: number | null }) {
  const { text, color } = makeBar(value);
  return (
    <div className="grid grid-cols-[36px_1fr_60px] gap-2 items-center text-xs my-1">
      <span className="text-muted">{label}</span>
      <span className={COLOR[color]}>{text}</span>
      <span className="text-right">{fmtPercent(value)}</span>
    </div>
  );
}
