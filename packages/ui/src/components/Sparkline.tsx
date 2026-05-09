import { useState } from 'react';
import { fmtPercent, fmtRate } from '../lib/format';
import type { HistoryPoint } from '../store';

export type SparklineField = 'cpu' | 'mem' | 'disk' | 'net' | 'io';

interface Bucket {
  v: number | null;
  tEnd: number;
}

const TARGET_BARS = 48; // 12h ÷ 15 min = 48 buckets

function extractValue(p: HistoryPoint, field: SparklineField): number | null {
  if (field === 'net') {
    if (p.netRx === null && p.netTx === null) return null;
    return (p.netRx ?? 0) + (p.netTx ?? 0);
  }
  if (field === 'io') {
    if (p.ioRead === null && p.ioWrite === null) return null;
    return (p.ioRead ?? 0) + (p.ioWrite ?? 0);
  }
  return p[field];
}

function isPercentField(f: SparklineField): boolean {
  return f !== 'net' && f !== 'io';
}

function formatValue(v: number | null, field: SparklineField): string {
  if (v === null) return '—';
  return isPercentField(field) ? fmtPercent(v) : fmtRate(v);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Sparkline({
  label,
  field,
  points,
}: {
  label: string;
  field: SparklineField;
  points: HistoryPoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Cursor x relative to the SVG, in CSS pixels. Drives tooltip horizontal position.
  const [tooltipX, setTooltipX] = useState<number | null>(null);

  const buckets = bucketize(points, field, TARGET_BARS);

  const hovered =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < buckets.length
      ? buckets[hoverIdx]
      : null;

  const scaleMax = isPercentField(field)
    ? 100
    : Math.max(
        1,
        ...buckets.map((b) => b.v).filter((v): v is number => typeof v === 'number'),
      );

  return (
    <div className="flex items-center gap-2 pt-2 mt-2 border-t border-dashed border-border h-7 text-[11px]">
      <span className="shrink-0 truncate min-w-[88px] text-muted">{label}</span>

      {/* Relative wrapper for the tooltip's absolute positioning. */}
      <div className="relative flex-1 h-full">
        {buckets.length === 0 ? (
          <span className="text-muted opacity-50">collecting…</span>
        ) : (
          <svg
            viewBox={`0 0 ${buckets.length} 100`}
            preserveAspectRatio="none"
            className="block w-full h-6 cursor-crosshair"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width === 0) return;
              const offsetX = e.clientX - rect.left;
              const ratio = offsetX / rect.width;
              const idx = Math.floor(ratio * buckets.length);
              setHoverIdx(Math.max(0, Math.min(buckets.length - 1, idx)));
              setTooltipX(offsetX);
            }}
            onMouseLeave={() => {
              setHoverIdx(null);
              setTooltipX(null);
            }}
          >
            {buckets.map((b, i) => {
              if (b.v === null) return null;
              const norm = Math.max(0, Math.min(1, b.v / scaleMax));
              const h = norm * 100;
              const isHovered = i === hoverIdx;
              return (
                <rect
                  key={i}
                  x={i + 0.1}
                  y={100 - h}
                  width={0.8}
                  height={Math.max(0.5, h)}
                  fill={isHovered ? '#aef0c8' : '#6ec4c4'}
                />
              );
            })}
          </svg>
        )}

        {/* Tooltip floats above the cursor. Skipped for empty buckets so we
            don't display "8:00 AM · —" type garbage when hovering padded space. */}
        {hovered && hovered.v !== null && tooltipX !== null && (
          <div
            className="absolute pointer-events-none whitespace-nowrap text-[10px] text-text bg-panel border border-border px-1.5 py-0.5 z-10"
            style={{
              left: `${tooltipX}px`,
              top: '-4px',
              transform: 'translate(-50%, -100%)',
            }}
          >
            {fmtTime(hovered.tEnd)} · {formatValue(hovered.v, field)}
          </div>
        )}
      </div>
    </div>
  );
}

function bucketize(
  points: HistoryPoint[],
  field: SparklineField,
  target: number,
): Bucket[] {
  if (points.length === 0) {
    return Array.from({ length: target }, () => ({ v: null, tEnd: 0 }));
  }
  const step = Math.max(1, Math.ceil(points.length / target));
  const out: Bucket[] = [];
  for (let i = 0; i < points.length; i += step) {
    const slice = points.slice(i, i + step);
    let sum = 0;
    let count = 0;
    for (const p of slice) {
      const v = extractValue(p, field);
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    out.push({
      v: count > 0 ? sum / count : null,
      tEnd: slice[slice.length - 1]?.timestamp ?? Date.now(),
    });
  }
  while (out.length < target) {
    out.unshift({ v: null, tEnd: 0 });
  }
  return out;
}
