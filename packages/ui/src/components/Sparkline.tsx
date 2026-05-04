import { makeSparkline } from '../lib/format';

export function Sparkline({
  label,
  values,
}: {
  label: string;
  values: ReadonlyArray<number | null>;
}) {
  return (
    <div className="grid grid-cols-[36px_1fr] gap-2 items-end pt-2 mt-2 border-t border-dashed border-border h-7">
      <span className="text-[11px] text-muted self-center">{label}</span>
      <span className="text-cyan tracking-[1px] leading-none text-sm">
        {makeSparkline(values)}
      </span>
    </div>
  );
}
