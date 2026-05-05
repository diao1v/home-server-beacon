import { useState } from 'react';
import { fmtPercent, fmtRate } from '../lib/format';
import type { HistoryPoint } from '../store';

export type SparklineField = 'cpu' | 'mem' | 'disk' | 'net';

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
  return p[field];
}

function isPercentField(f: SparklineField): boolean {
  return f !== 'net';
}

function formatValue(v: number | null, field: SparklineField): string {
  if (v === null) return '—';
  return field === 'net' ? fmtRate(v) : fmtPercent(v);
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
  const buckets = bucketize(points, field, TARGET_BARS);

  const hovered =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < buckets.length
      ? buckets[hoverIdx]
      : null;

  // Bar fill is relative to: 100 for percent fields, max-of-window for net.
  const scaleMax = isPercentField(field)
    ? 100
    : Math.max(
        1,
        ...buckets
          .map((b) => b.v)
          .filter((v): v is number => typeof v === 'number'),
      );

  const headText = hovered
    ? `${fmtTime(hovered.tEnd)} · ${formatValue(hovered.v, field)}`
    : label;

  return (
    <div className="flex items-center gap-2 pt-2 mt-2 border-t border-dashed border-border h-7 text-[11px]">
      <span
        className={`shrink-0 truncate min-w-[88px] ${hovered ? 'text-text' : 'text-muted'}`}
      >
        {headText}
      </span>

      {buckets.length === 0 ? (
        <span className="flex-1 text-muted opacity-50">collecting…</span>
      ) : (
        <svg
          viewBox={`0 0 ${buckets.length} 100`}
          preserveAspectRatio="none"
          className="block flex-1 h-6 cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width === 0) return;
            const ratio = (e.clientX - rect.left) / rect.width;
            const idx = Math.floor(ratio * buckets.length);
            setHoverIdx(Math.max(0, Math.min(buckets.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
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
    </div>
  );
}

function bucketize(
  points: HistoryPoint[],
  field: SparklineField,
  target: number,
): Bucket[] {
  if (points.length === 0) return [];
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
  return out;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
