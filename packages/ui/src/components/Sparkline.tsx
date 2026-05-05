import { useState } from 'react';
import { fmtPercent } from '../lib/format';
import type { HistoryPoint } from '../store';

type Field = 'cpu' | 'mem' | 'disk';

interface Bucket {
  v: number | null;
  tEnd: number; // timestamp of the latest sample in the bucket
}

const TARGET_BARS = 48; // 12h ÷ 15 min = 48 buckets

export function Sparkline({
  label,
  field,
  points,
}: {
  label: string;
  field: Field;
  points: HistoryPoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const buckets = bucketize(points, field, TARGET_BARS);

  const hovered =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < buckets.length
      ? buckets[hoverIdx]
      : null;

  // Header text flips between the static label and the hover readout.
  const headText = hovered
    ? `${fmtTime(hovered.tEnd)} · ${fmtPercent(hovered.v)}`
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
            const v = Math.max(0, Math.min(100, b.v));
            const isHovered = i === hoverIdx;
            return (
              <rect
                key={i}
                x={i + 0.1}
                y={100 - v}
                width={0.8}
                height={Math.max(0.5, v)}
                fill={isHovered ? '#aef0c8' : '#6ec4c4'}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

function bucketize(points: HistoryPoint[], field: Field, target: number): Bucket[] {
  if (points.length === 0) return [];
  const step = Math.max(1, Math.ceil(points.length / target));
  const out: Bucket[] = [];
  for (let i = 0; i < points.length; i += step) {
    const slice = points.slice(i, i + step);
    let sum = 0;
    let count = 0;
    for (const p of slice) {
      const v = p[field];
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
