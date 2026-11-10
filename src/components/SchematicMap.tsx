"use client";

import type { ChartSpec } from "@/lib/types";
import { levelColor } from "@/lib/zoneLevel";

const USN = "#c45c4a";
const IJN = "#3b82a8";
const ISLAND = "#ca8a04";
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type SchematicMode =
  | "units"
  | "axes"
  | "rose"
  | "rings"
  | "highlights"
  | "zones"
  | "pairs"
  | "locator";

type Row = ChartSpec["series"][number];

function isSector(name: string) {
  return (SECTORS as readonly string[]).includes(name);
}

function isIsland(s: Row) {
  return s.group === "登陆海域" || /中途岛|island/i.test(s.name);
}

function polar(cx: number, cy: number, r: number, bearingDeg: number) {
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
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
  const sweep = (endDeg - startDeg + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${a0.x.toFixed(1)} ${a0.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${a1.x.toFixed(1)} ${a1.y.toFixed(1)} Z`;
}

function shortLabel(name: string, max = 6) {
  const n = name
    .replace(/^(USS|IJN)\s+/i, "")
    .replace(/集群|编队|航母/g, "")
    .trim();
  if (n.length <= max) return n;
  const parts = n.split(/→|->|↔/);
  if (parts.length === 2) {
    return `${parts[0].slice(0, 3).trim()}→${parts[1].slice(0, 3).trim()}`;
  }
  return `${n.slice(0, max - 1)}…`;
}

export function schematicModeFor(chart: ChartSpec): SchematicMode {
  if (chart.id === "cmp-intent-axes") return "axes";
  if (chart.id === "cmp-force-bearing") return "rose";
  if (chart.id === "cmp-force-range") return "rings";
  if (chart.id === "cmp-highlight-range") return "highlights";
  if (chart.id === "cmp-zone-footprint") return "zones";
  if (chart.id === "cmp-hunt-range") return "pairs";
  if (chart.id === "cmp-threat-rank") return "locator";
  return "units";
}

export function SchematicMap({
  series,
  mode,
  compact,
  onSelectName,
}: {
  series: ChartSpec["series"];
  mode: SchematicMode;
  compact?: boolean;
  onSelectName?: (name: string) => void;
}) {
  const rows = series ?? [];
  const axes = rows.filter(
    (s) => typeof s.x2 === "number" && typeof s.y2 === "number",
  );
  const pairDots: Row[] =
    mode === "pairs"
      ? axes.flatMap((a) => [
          {
            name: a.name.split(/↔|→/)[0] || a.name,
            value: Number(a.value) || 0,
            x: a.x,
            y: a.y,
            side: a.side,
          },
          {
            name: a.name.split(/↔|→/)[1] || "",
            value: Number(a.value) || 0,
            x: a.x2,
            y: a.y2,
            side: a.side,
          },
        ])
      : [];
  const units = [
    ...rows.filter(
      (s) =>
        typeof s.x === "number" &&
        typeof s.y === "number" &&
        !isSector(s.name) &&
        !isIsland(s) &&
        (s.x2 == null || mode === "locator"),
    ),
    ...pairDots.filter((s) => s.name && s.name !== "岛"),
  ];
  const zones = rows.filter(
    (s) =>
      typeof s.x === "number" &&
      typeof s.y === "number" &&
      (s.group === "活动区" ||
        /紧急|高|中|低/.test(s.group ?? "")) &&
      (s.value ?? 0) > 1,
  );
  const wedges = SECTORS.map((name) => ({
    name,
    us:
      Number(
        rows.find((d) => d.name === name && d.side === "USN")?.value,
      ) || 0,
    ij:
      Number(
        rows.find((d) => d.name === name && d.side === "IJN")?.value,
      ) || 0,
  }));
  const hasRose = wedges.some((w) => w.us + w.ij > 0);

  const xs = [0];
  const ys = [0];
  for (const s of [...units, ...axes, ...zones]) {
    if (typeof s.x === "number") xs.push(s.x);
    if (typeof s.y === "number") ys.push(s.y);
    if (typeof s.x2 === "number") xs.push(s.x2);
    if (typeof s.y2 === "number") ys.push(s.y2);
    if (mode === "zones" && typeof s.x === "number") {
      const r = Number(s.value) || 0;
      xs.push(s.x - r, s.x + r);
      ys.push((s.y ?? 0) - r, (s.y ?? 0) + r);
    }
  }
  const shipR = units.map((u) => Math.hypot(Number(u.x) || 0, Number(u.y) || 0));
  const maxShip = Math.max(40, ...shipR, 1);
  if (mode === "rings" || mode === "highlights") {
    xs.push(-maxShip, maxShip);
    ys.push(-maxShip, maxShip);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 40);
  const pad = span * 0.16;
  const vb = 200;
  const cx0 = (minX + maxX) / 2;
  const cy0 = (minY + maxY) / 2;
  const scale = (vb * 0.84) / (span + pad * 2);

  const toX = (east: number) => vb / 2 + (east - cx0) * scale;
  const toY = (north: number) => vb / 2 - (north - cy0) * scale;
  const ix = toX(0);
  const iy = toY(0);

  const ringSteps =
    mode === "rings" || mode === "highlights"
      ? [0.4, 0.7, 1].map((p) => Math.round((maxShip * p) / 10) * 10)
      : [];

  const nearestFirst =
    mode === "highlights" || mode === "rings" || mode === "pairs";
  const labelUnits = [...units]
    .sort((a, b) =>
      nearestFirst
        ? (Number(a.value) || 0) - (Number(b.value) || 0)
        : (Number(b.value) || 0) - (Number(a.value) || 0),
    )
    .slice(
      0,
      mode === "locator" || mode === "highlights" || mode === "axes" ? 4 : 2,
    );

  const maxW = Math.max(1, ...wedges.map((w) => w.us + w.ij));
  const roseR = Math.min(54, 18 + maxW * 3);

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      className="h-full w-full"
      role="img"
      aria-label="简化态势小地图"
    >
      <rect width={vb} height={vb} fill="#eef2f1" />
      <text
        x={vb / 2}
        y={11}
        textAnchor="middle"
        fill="#8a857c"
        fontSize={compact ? 8 : 9}
      >
        N
      </text>
      <line
        x1={vb / 2}
        y1={14}
        x2={vb / 2}
        y2={22}
        stroke="#c4bfb6"
        strokeWidth={1}
      />

      {ringSteps.map((r) => (
        <circle
          key={r}
          cx={ix}
          cy={iy}
          r={Math.max(2, r * scale)}
          fill="none"
          stroke="#c5c0b6"
          strokeWidth={0.7}
          strokeDasharray="3 3"
        />
      ))}

      {mode === "rose" && hasRose
        ? wedges.map((w, i) => {
            const start = i * 45 - 22.5;
            const end = start + 45;
            const ru = (w.us / maxW) * roseR;
            const rj = (w.ij / maxW) * roseR;
            return (
              <g key={w.name}>
                {ru > 2 ? (
                  <path
                    d={wedgePath(ix, iy, ru, start, (start + end) / 2)}
                    fill={USN}
                    fillOpacity={0.28}
                    stroke={USN}
                    strokeWidth={0.6}
                    className={onSelectName ? "cursor-pointer" : undefined}
                    onClick={() => onSelectName?.(w.name)}
                  />
                ) : null}
                {rj > 2 ? (
                  <path
                    d={wedgePath(ix, iy, rj, (start + end) / 2, end)}
                    fill={IJN}
                    fillOpacity={0.28}
                    stroke={IJN}
                    strokeWidth={0.6}
                    className={onSelectName ? "cursor-pointer" : undefined}
                    onClick={() => onSelectName?.(w.name)}
                  />
                ) : null}
              </g>
            );
          })
        : null}

      {(mode === "zones" ? zones : []).map((z) => {
        const r = Math.max(4, (Number(z.value) || 8) * scale);
        const color = levelColor(z.group || "");
        return (
          <circle
            key={z.name}
            cx={toX(Number(z.x))}
            cy={toY(Number(z.y))}
            r={r}
            fill={color}
            fillOpacity={0.12}
            stroke={color}
            strokeWidth={1.2}
            strokeDasharray="4 3"
            className={onSelectName ? "cursor-pointer" : undefined}
            onClick={() => onSelectName?.(z.name)}
          />
        );
      })}

      {axes.map((a, i) => {
        const x1 = toX(Number(a.x));
        const y1 = toY(Number(a.y));
        const x2 = toX(Number(a.x2));
        const y2 = toY(Number(a.y2));
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
        const color = a.side === "IJN" ? IJN : USN;
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const ah = 6;
        return (
          <g
            key={`ax-${a.name}-${i}`}
            className={onSelectName ? "cursor-pointer" : undefined}
            onClick={() => onSelectName?.(a.name)}
          >
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={1.6}
              strokeDasharray={mode === "pairs" ? "4 2" : undefined}
            />
            <polygon
              points={`${x2},${y2} ${x2 - ah * Math.cos(ang - 0.4)},${y2 - ah * Math.sin(ang - 0.4)} ${x2 - ah * Math.cos(ang + 0.4)},${y2 - ah * Math.sin(ang + 0.4)}`}
              fill={color}
            />
            {mode === "axes" || mode === "pairs" ? (
              <text
                x={x2}
                y={y2 - 5}
                textAnchor="middle"
                fill={color}
                fontSize={7.5}
                fontWeight={600}
              >
                {shortLabel(a.name, 8)}
              </text>
            ) : null}
          </g>
        );
      })}

      {units.map((u, i) => {
        const top = labelUnits.some((l) => l.name === u.name);
        const r = mode === "locator" && top ? 3.4 : 2.4;
        const fill = u.side === "IJN" ? IJN : USN;
        const px = toX(Number(u.x));
        const py = toY(Number(u.y));
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return (
          <g
            key={`u-${u.name}-${i}`}
            className={onSelectName ? "cursor-pointer" : undefined}
            onClick={() => onSelectName?.(u.name)}
          >
            <circle
              cx={px}
              cy={py}
              r={r}
              fill={fill}
              stroke="#fff"
              strokeWidth={0.7}
            />
            {top ? (
              <text
                x={px + 4}
                y={py + 3}
                fill="#3d3a34"
                fontSize={7}
              >
                {shortLabel(u.name, 7)}
              </text>
            ) : null}
          </g>
        );
      })}

      <circle
        cx={ix}
        cy={iy}
        r={4.2}
        fill={ISLAND}
        stroke="#fff"
        strokeWidth={1}
      />
      <text
        x={ix + 6}
        y={iy + 3}
        fill={ISLAND}
        fontSize={8}
        fontWeight={700}
      >
        岛
      </text>
    </svg>
  );
}
