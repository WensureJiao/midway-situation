"use client";

const USN = "#c45c4a";
const IJN = "#3b82a8";
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type RoseWedge = {
  name: string;
  us: number;
  ij: number;
};

export type RoseArrow = {
  name: string;
  bearingDeg: number;
  nm: number;
  side: "USN" | "IJN";
};

function polar(cx: number, cy: number, r: number, bearingDeg: number) {
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function offset(
  x: number,
  y: number,
  dist: number,
  bearingDeg: number,
) {
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  return { x: x + dist * Math.cos(rad), y: y + dist * Math.sin(rad) };
}

function wedgePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  const a0 = polar(cx, cy, r, startDeg);
  const a1 = polar(cx, cy, r, endDeg);
  const sweep = ((endDeg - startDeg + 360) % 360);
  const large = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${a0.x.toFixed(2)} ${a0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${a1.x.toFixed(2)} ${a1.y.toFixed(2)} Z`;
}

function shortAxis(name: string) {
  const n = name.replace(/集群|编队/g, "").trim();
  if (n.length <= 8) return n;
  const parts = n.split(/→|->/);
  if (parts.length === 2) {
    return `${parts[0].slice(0, 4).trim()}→${parts[1].slice(0, 4).trim()}`;
  }
  return `${n.slice(0, 7)}…`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function WindRose({
  wedges,
  arrows,
  compact,
  onSelectSector,
  onSelectArrow,
}: {
  wedges?: RoseWedge[];
  arrows?: RoseArrow[];
  compact?: boolean;
  onSelectSector?: (name: string) => void;
  onSelectArrow?: (name: string) => void;
}) {
  const vb = 200;
  const cx = 100;
  const cy = 100;
  const R = compact ? 70 : 78;
  const maxW = Math.max(
    1,
    ...(wedges ?? []).flatMap((w) => [w.us, w.ij]),
  );
  const maxA = Math.max(1, ...(arrows ?? []).map((a) => a.nm));

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      className="h-full w-full select-none"
      role="img"
    >
      {[1 / 3, 2 / 3, 1].map((t) => (
        <circle
          key={t}
          cx={cx}
          cy={cy}
          r={R * t}
          fill="none"
          stroke="#c5c1b8"
          strokeWidth={0.7}
        />
      ))}
      {CARDINALS.map((name, i) => {
        const p = polar(cx, cy, R, i * 45);
        return (
          <line
            key={`spoke-${name}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#d9d4cc"
            strokeWidth={0.6}
          />
        );
      })}
      {CARDINALS.map((name, i) => {
        const major = i % 2 === 0;
        const p = polar(cx, cy, R + (compact ? 11 : 13), i * 45);
        return (
          <text
            key={`lab-${name}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={major ? 10 : 8}
            fontWeight={major ? 700 : 500}
            fill={major ? "#3d3a34" : "#8a857c"}
          >
            {name}
          </text>
        );
      })}

      {wedges?.map((w, i) => {
        const center = i * 45;
        const usR = (w.us / maxW) * R;
        const ijR = (w.ij / maxW) * R;
        const peak =
          w.us >= maxW * 0.98 || w.ij >= maxW * 0.98;
        return (
          <g
            key={w.name}
            onClick={() => onSelectSector?.(w.name)}
            style={{ cursor: onSelectSector ? "pointer" : undefined }}
          >
            {usR > 1.5 ? (
              <path
                d={wedgePath(cx, cy, usR, center - 20, center - 1)}
                fill={USN}
                fillOpacity={peak ? 0.92 : 0.5}
                stroke={USN}
                strokeWidth={peak ? 1.4 : 0.7}
              />
            ) : null}
            {ijR > 1.5 ? (
              <path
                d={wedgePath(cx, cy, ijR, center + 1, center + 20)}
                fill={IJN}
                fillOpacity={peak ? 0.92 : 0.5}
                stroke={IJN}
                strokeWidth={peak ? 1.4 : 0.7}
              />
            ) : null}
          </g>
        );
      })}

      {arrows?.map((a) => {
        const r = 12 + (a.nm / maxA) * (R - 16);
        const tip = polar(cx, cy, r, a.bearingDeg);
        const color = a.side === "IJN" ? IJN : USN;
        const left = offset(tip.x, tip.y, 7, a.bearingDeg + 148);
        const right = offset(tip.x, tip.y, 7, a.bearingDeg - 148);
        const rawLab = polar(cx, cy, Math.min(R + 2, r + 12), a.bearingDeg);
        const lab = {
          x: clamp(rawLab.x, 22, 178),
          y: clamp(rawLab.y, 14, 186),
        };
        const label = `${shortAxis(a.name)} ${Math.round(a.nm)}`;
        return (
          <g
            key={`${a.side}-${a.name}`}
            onClick={() => onSelectArrow?.(a.name)}
            style={{ cursor: onSelectArrow ? "pointer" : undefined }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke={color}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <polygon
              points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
              fill={color}
            />
            <circle
              cx={tip.x}
              cy={tip.y}
              r={2.1}
              fill="#fff"
              stroke={color}
              strokeWidth={1}
            />
            <text
              x={lab.x}
              y={lab.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7.5}
              fontWeight={700}
              fill={color}
              stroke="#f4f1ea"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {label}
            </text>
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={3.2} fill="#3d3a34" stroke="#f4f1ea" strokeWidth={1.2} />
    </svg>
  );
}
