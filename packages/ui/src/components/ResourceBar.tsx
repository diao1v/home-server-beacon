import { type BarColor, fmtPercent, makeBar } from '../lib/format';

const COLOR: Record<BarColor, string> = {
  green: 'text-green',
  amber: 'text-amber',
  red: 'text-red',
  muted: 'text-muted',
};

interface Props {
  label: string;
  value: number | null;
  /** Number-to-string formatter for the right-hand value column. Default appends `%`. */
  format?: (v: number | null) => string;
  /**
   * Bar fill basis. Defaults to `value` (treats it as 0-100%). Override when the
   * raw value isn't a percentage — e.g. CPU temperature, where we want the bar to
   * fill based on a temp-to-percent mapping.
   */
  barValue?: number | null;
}

export function ResourceBar({ label, value, format = fmtPercent, barValue }: Props) {
  const { text, color } = makeBar(barValue ?? value);
  return (
    <div className="grid grid-cols-[36px_1fr_60px] gap-2 items-center text-xs my-1">
      <span className="text-muted">{label}</span>
      <span className={COLOR[color]}>{text}</span>
      <span className="text-right">{format(value)}</span>
    </div>
  );
}
