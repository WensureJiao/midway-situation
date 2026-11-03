"use client";

import { useState, type MouseEvent } from "react";

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
  onSelectName,
}: {
  links: LinkRow[];
  compact?: boolean;
  onSelectName?: (name: string) => void;
}) {
  const left = Array.from(new Set(links.map((l) => l.name)));
  const right = Array.from(
    new Set(links.map((l) => String(l.group ?? "其他"))),
  );
  const maxV = Math.max(1, ...links.map((l) => Number(l.value) || 0));
  const h = compact ? 120 : 180;
  const w = compact ? 260 : 320;
  const leftX = 6;
  const rightX = w - 6;
  const nodeW = 68;
  const nodeH = compact ? 16 : 14;
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    from: string;
    to: string;
    nm: number;
  } | null>(null);
  const fillOf = (name: string, side: "left" | "right") => {
    const hit = links.find((l) =>
      side === "left" ? l.name === name : String(l.group ?? "") === name,
    );
    return hit?.fill || DEFAULT_STROKE;
  };
  const leftY = (i: number) =>
    ((i + 0.5) / Math.max(left.length, 1)) * (h - 16) + 8 - nodeH / 2;
  const rightY = (i: number) =>
    ((i + 0.5) / Math.max(right.length, 1)) * (h - 16) + 8 - nodeH / 2;
  const moveTip = (
    e: MouseEvent<SVGElement>,
    from: string,
    to: string,
    nm: number,
  ) => {
    const box = e.currentTarget.ownerSVGElement?.parentElement;
    if (!box) return;
    const r = box.getBoundingClientRect();
    setTip({
      x: Math.max(6, Math.min(e.clientX - r.left + 10, r.width - 132)),
      y: Math.max(6, Math.min(e.clientY - r.top + 10, r.height - 40)),
      from,
      to,
      nm,
    });
  };

  return (
    <div className="relative h-full w-full" onMouseLeave={() => setTip(null)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full"
        role="img"
        aria-label="对准关系流向"
        preserveAspectRatio="xMidYMid meet"
      >
        {links.map((l, i) => {
          const si = left.indexOf(l.name);
          const ti = right.indexOf(String(l.group ?? "其他"));
          if (si < 0 || ti < 0) return null;
          const y1 = leftY(si) + nodeH / 2;
          const y2 = rightY(ti) + nodeH / 2;
          const thick = 2 + (10 * (Number(l.value) || 0)) / maxV;
          const mid = (leftX + nodeW + rightX - nodeW) / 2;
          const x1 = leftX + nodeW;
          const x2 = rightX - nodeW;
          const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
          const to = String(l.group ?? "其他");
          const nm = Math.round(Number(l.value) || 0);
          const active =
            tip?.from === l.name && tip?.to === to && tip?.nm === nm;
          const pad = 10;
          return (
            <g key={`${l.name}-${l.group}-${i}`}>
              <path
                d={d}
                fill="none"
                stroke={l.fill || DEFAULT_STROKE}
                strokeOpacity={
                  active
                    ? 0.95
                    : 0.35 + (0.45 * (Number(l.value) || 0)) / maxV
                }
                strokeWidth={thick}
                strokeLinecap="round"
              />
              <rect
                x={x1}
                y={Math.min(y1, y2) - pad}
                width={Math.max(8, x2 - x1)}
                height={Math.max(thick + pad * 2, Math.abs(y2 - y1) + pad * 2)}
                fill="transparent"
                className="cursor-help"
                onMouseEnter={(e) => moveTip(e, l.name, to, nm)}
                onMouseMove={(e) => moveTip(e, l.name, to, nm)}
              />
            </g>
          );
        })}
        {left.map((name, i) => (
          <g
            key={`L-${name}`}
            className={onSelectName ? "cursor-pointer" : undefined}
            onClick={() => onSelectName?.(name)}
          >
            <rect
              x={leftX}
              y={leftY(i)}
              width={nodeW}
              height={nodeH}
              rx={3}
              fill={fillOf(name, "left")}
              fillOpacity={0.18}
              stroke={fillOf(name, "left")}
            />
            <text
              x={leftX + nodeW / 2}
              y={leftY(i) + (compact ? 11 : 10)}
              textAnchor="middle"
              fontSize={9}
              fill="var(--ink)"
            >
              {name.length > 7 ? `${name.slice(0, 6)}…` : name}
            </text>
          </g>
        ))}
        {right.map((name, i) => (
          <g
            key={`R-${name}`}
            className={onSelectName ? "cursor-pointer" : undefined}
            onClick={() => onSelectName?.(name)}
          >
            <rect
              x={rightX - nodeW}
              y={rightY(i)}
              width={nodeW}
              height={nodeH}
              rx={3}
              fill="var(--panel)"
              stroke="var(--line)"
            />
            <text
              x={rightX - nodeW / 2}
              y={rightY(i) + (compact ? 11 : 10)}
              textAnchor="middle"
              fontSize={9}
              fill="var(--ink)"
            >
              {name.length > 7 ? `${name.slice(0, 6)}…` : name}
            </text>
          </g>
        ))}
      </svg>
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[140px] rounded bg-[var(--panel-3)] px-1.5 py-1 text-[10px] leading-tight text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="truncate">
            {tip.from} → {tip.to}
          </div>
          <div className="tabular-nums text-[var(--muted)]">
            带宽 {tip.nm} nm
          </div>
        </div>
      ) : null}
    </div>
  );
}
