"use client";

type LinkRow = {
  name: string;
  group?: string;
  value: number;
  detail?: string;
  fill?: string;
};

const DEFAULT_STROKE = "#c45c4a";

/** 简易桑基：name → group，value=流量 */
export function SankeyFlow({
  links,
  compact,
}: {
  links: LinkRow[];
  compact?: boolean;
}) {
  const left = Array.from(new Set(links.map((l) => l.name)));
  const right = Array.from(
    new Set(links.map((l) => String(l.group ?? "其他"))),
  );
  const maxV = Math.max(1, ...links.map((l) => Number(l.value) || 0));
  const h = compact ? 140 : 180;
  const w = 320;
  const leftX = 8;
  const rightX = w - 8;
  const nodeH = 14;
  const leftY = (i: number) =>
    ((i + 0.5) / Math.max(left.length, 1)) * (h - 16) + 8 - nodeH / 2;
  const rightY = (i: number) =>
    ((i + 0.5) / Math.max(right.length, 1)) * (h - 16) + 8 - nodeH / 2;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img">
      {links.map((l, i) => {
        const si = left.indexOf(l.name);
        const ti = right.indexOf(String(l.group ?? "其他"));
        if (si < 0 || ti < 0) return null;
        const y1 = leftY(si) + nodeH / 2;
        const y2 = rightY(ti) + nodeH / 2;
        const thick = 2 + (10 * (Number(l.value) || 0)) / maxV;
        const mid = (leftX + 72 + rightX - 72) / 2;
        return (
          <path
            key={`${l.name}-${l.group}-${i}`}
            d={`M ${leftX + 72} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${rightX - 72} ${y2}`}
            fill="none"
            stroke={l.fill || DEFAULT_STROKE}
            strokeOpacity={0.35 + (0.45 * (Number(l.value) || 0)) / maxV}
            strokeWidth={thick}
          >
            <title>
              {l.detail || `${l.name} → ${l.group}：${l.value}`}
            </title>
          </path>
        );
      })}
      {left.map((name, i) => (
        <g key={`L-${name}`}>
          <rect
            x={leftX}
            y={leftY(i)}
            width={68}
            height={nodeH}
            rx={3}
            fill="var(--panel)"
            stroke="var(--line)"
          />
          <text
            x={leftX + 34}
            y={leftY(i) + 10}
            textAnchor="middle"
            fontSize={9}
            fill="var(--ink)"
          >
            {name.length > 6 ? `${name.slice(0, 6)}…` : name}
          </text>
        </g>
      ))}
      {right.map((name, i) => (
        <g key={`R-${name}`}>
          <rect
            x={rightX - 68}
            y={rightY(i)}
            width={68}
            height={nodeH}
            rx={3}
            fill="var(--panel)"
            stroke="var(--line)"
          />
          <text
            x={rightX - 34}
            y={rightY(i) + 10}
            textAnchor="middle"
            fontSize={9}
            fill="var(--ink)"
          >
            {name.length > 6 ? `${name.slice(0, 6)}…` : name}
          </text>
        </g>
      ))}
    </svg>
  );
}
