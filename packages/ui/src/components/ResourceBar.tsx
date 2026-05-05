import { type BarColor, makeBar } from '../lib/format';

const COLOR: Record<BarColor, string> = {
  green: 'text-green',
  amber: 'text-amber',
  red: 'text-red',
  muted: 'text-muted',
};

interface Props {
  /** Left-side label. Short ("CPU"/"RAM") or a path ("/", "/mnt/data"). */
  label: string;
  /** 0-100 value used to fill the visual bar. Null renders as empty/muted. */
  barValue: number | null;
  /** Right-side text. Caller decides format ("32.4%", "2.2G/16G", "37°C"). */
  valueText: string;
}

export function ResourceBar({ label, barValue, valueText }: Props) {
  const { text, color } = makeBar(barValue);
  return (
    <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center text-xs my-1">
      <span className="text-muted truncate" title={label}>
        {label}
      </span>
      <span className={COLOR[color]}>{text}</span>
      <span className="text-right whitespace-nowrap">{valueText}</span>
    </div>
  );
}
