import type {
  ChartSpec,
  CompactUnit,
  SituationViewSpec,
  SlicePack,
  TaskFocus,
} from "./types";
import {
  CAMPAIGN_BEAT_CODE,
  inferCampaignBeat,
  intentEvidenceItems,
  type CampaignBeat,
} from "./vmmpCompare";
import { selectChartSlotIds } from "./vmmpChartSelect";
import { expandBundledShipTarget } from "./splitShipTargets";

const INTENT_BEATS: CampaignBeat[] = [
  "集结",
  "搜索",
  "危机",
  "残局",
  "终局",
];

function intentPhaseSeries(
  spec: SituationViewSpec,
  packPhase?: string,
): ChartSpec["series"] {
  const beat = inferCampaignBeat(packPhase ?? "", spec);
  return INTENT_BEATS.map((name) => ({
    name,
    value: name === beat ? CAMPAIGN_BEAT_CODE[name] : 0,
    detail:
      name === beat
        ? `当前阶段 · ${spec.phase_label?.trim() || name}`
        : `${name}（非当前）`,
  }));
}

/** 主栏 PHASE：五拍柱状（当前拍高亮） */
export function buildPhaseBeatChart(
  spec: SituationViewSpec,
  packPhase?: string,
): ChartSpec {
  return {
    id: "cmp-intent-phase",
    type: "bar",
    title: "战役阶段",
    description: "五拍节拍；当前阶段柱高为节拍编码",
    series: intentPhaseSeries(spec, packPhase),
  };
}

/** 主栏 / 扩展：作战指向明细（每条轴一行，颜色分美日） */
export function buildAxesCountChart(spec: SituationViewSpec): ChartSpec {
  return {
    id: "cmp-intent-axes",
    type: "hbar",
    title: "问：美/日各画了哪些作战指向？",
    description: "每条轴一行；红=美方、蓝=日方；悬停看起终点",
    why_type: "M：Associative+Relate → Connection ⇒ hbar",
    series: intentAxisDetailSeries(spec.map?.axes),
  };
}

export { CHART_TYPE_CATALOG, chartTypeLabel } from "./chartTypes";

function perspectiveBucket(
  perspective: string,
): "红方看蓝方" | "蓝方看红方" | null {
  if (/红方看蓝方|美方看日方/.test(perspective)) return "红方看蓝方";
  if (/蓝方看红方|日方看美方/.test(perspective)) return "蓝方看红方";
  if (/红方看|美方看/.test(perspective)) return "红方看蓝方";
  if (/蓝方看|日方看/.test(perspective)) return "蓝方看红方";
  return null;
}

/** 证据构成：英文类目 + 计数 + 悬停明细（中文原文在 detail） */
function evidenceCompositionSeries(
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const items = intentEvidenceItems(spec).filter(
    (i) => i.kind !== "叙述" && i.kind !== "叙述依据",
  );
  const keys = [
    { kind: "方向", name: "Direction" },
    { kind: "关键实体", name: "Entity" },
    { kind: "活动区", name: "Zone" },
  ] as const;
  return keys.map(({ kind, name }) => {
    const texts = items.filter((i) => i.kind === kind).map((i) => i.text);
    return {
      name,
      value: texts.length,
      detail: texts.length
        ? texts.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : `No ${name.toLowerCase()} evidence`,
    };
  });
}

function fmtLatLon(p: [number, number]): string {
  const [lat, lon] = p;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** 扩展用：每条作战指向单独成行，标签差异在 A/B 间一眼可见 */
function intentAxisDetailSeries(
  axes: NonNullable<SituationViewSpec["map"]>["axes"],
): ChartSpec["series"] {
  const list = axes ?? [];
  if (!list.length) {
    return [
      {
        name: "（无作战指向）",
        value: 0,
        detail: "未画出轴线，无法对照意图方向",
      },
    ];
  }
  return list.map((a, i) => {
    const label = (a.label || a.id || `指向${i + 1}`).trim();
    const short =
      label.length > 22 ? `${label.slice(0, 20)}…` : label;
    const route =
      a.from && a.to
        ? `${fmtLatLon(a.from)} → ${fmtLatLon(a.to)}`
        : "起终点未标注";
    return {
      name: short,
      value: 1,
      side: a.side === "USN" || a.side === "IJN" ? a.side : undefined,
      detail: `${label}\n${a.side === "USN" ? "美方" : a.side === "IJN" ? "日方" : "未标侧"}\n${route}`,
    };
  });
}

function levelScoreValue(level: string): number {
  if (/紧急/.test(level)) return 4;
  if (/高/.test(level)) return 3;
  if (/中/.test(level)) return 2;
  if (/低/.test(level)) return 1;
  return 1;
}

function threatRankSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  return [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .flatMap((r) =>
      expandBundledShipTarget(r.target).map((name) => ({
        name: displayUnitName(name, 22),
        value: levelScoreValue(r.level),
        detail: `${r.level}${r.evidence ? ` — ${r.evidence}` : ""}`,
      })),
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** 中途岛（登陆/目标海域）锚点 */
function findLandingAnchor(pack: SlicePack): {
  lat: number;
  lon: number;
  label: string;
} {
  const units = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  const midway =
    units.find((u) => /中途岛主跑道/.test(u.name)) ||
    units.find(
      (u) =>
        u.unit_type === "Facility" &&
        /中途岛|Midway/i.test(`${u.name} ${u.group ?? ""}`),
    );
  if (midway) {
    return {
      lat: midway.latitude,
      lon: midway.longitude,
      label: "中途岛",
    };
  }
  return { lat: 28.207, lon: -177.382, label: "中途岛" };
}

/** 相对锚点：东向 / 北向海里 */
function nmOffsetFrom(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): { eastNm: number; northNm: number; rangeNm: number } {
  const northNm = (lat - originLat) * 60;
  const eastNm =
    (lon - originLon) * 60 * Math.cos((originLat * Math.PI) / 180);
  const rangeNm = Math.hypot(eastNm, northNm);
  return {
    eastNm: Math.round(eastNm * 10) / 10,
    northNm: Math.round(northNm * 10) / 10,
    rangeNm: Math.round(rangeNm * 10) / 10,
  };
}

function unitRankForScatter(u: CompactUnit): number {
  if (/航空母舰/.test(u.unit_class ?? "")) return 0;
  if (/战列/.test(u.unit_class ?? "")) return 1;
  if (/巡洋/.test(u.unit_class ?? "")) return 2;
  if (/驱逐/.test(u.unit_class ?? "")) return 3;
  if (u.unit_type === "Ship") return 4;
  return 9;
}

type ForceGeoPoint = {
  unit: CompactUnit;
  side: "USN" | "IJN";
  eastNm: number;
  northNm: number;
  rangeNm: number;
  bearingDeg: number;
};

/** 0=正北，顺时针 */
function bearingFromOffset(eastNm: number, northNm: number): number {
  const deg = (Math.atan2(eastNm, northNm) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const BEARING_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

function bearingSector(bearingDeg: number): (typeof BEARING_SECTORS)[number] {
  const idx = Math.round(bearingDeg / 45) % 8;
  return BEARING_SECTORS[idx];
}

function topRoseSectors(
  series: ChartSpec["series"],
  pick: (s: ChartSpec["series"][number]) => boolean,
  limit = 2,
): { name: string; value: number }[] {
  const bag = new Map<string, number>();
  for (const s of series) {
    if (!pick(s) || !(s.value > 0)) continue;
    bag.set(s.name, (bag.get(s.name) ?? 0) + s.value);
  }
  return [...bag.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function formatRoseTops(tops: { name: string; value: number }[]): string {
  if (!tops.length) return "无";
  return tops.map((t) => `${t.name}(${t.value})`).join("、");
}

/** 指向方位玫瑰：由起/终扇区分布生成看图结论 */
export function concludeAxisRose(series: ChartSpec["series"]): string {
  const from = topRoseSectors(series, (s) => s.group === "起点");
  const to = topRoseSectors(series, (s) => s.group === "终点");
  if (!from.length && !to.length) {
    return "本片无轴线端点可定位，暂无指向扇区结论。";
  }
  const fromSet = new Set(from.map((t) => t.name));
  const overlap = to.map((t) => t.name).filter((n) => fromSet.has(n));
  let verdict: string;
  if (!from.length || !to.length) {
    verdict = to.length
      ? "仅见终点落点，发起端不明确。"
      : "仅见起点落点，指向端不明确。";
  } else if (from[0].name === to[0].name) {
    verdict = `起终主峰同在 ${from[0].name}，近距/贴身指向，跨扇区不明显。`;
  } else if (overlap.length) {
    verdict = `起终部分重叠（${overlap.join("、")}），既有近距成分也有扇区偏移。`;
  } else {
    verdict = `起终分离：从 ${from[0].name} 指向 ${to[0].name}，属跨扇区长程轴线。`;
  }
  return `结论：终点主在 ${formatRoseTops(to)}；起点主在 ${formatRoseTops(from)}。${verdict}`;
}

/** 兵力方位玫瑰：由美/日扇区分布生成看图结论 */
export function concludeForceRose(series: ChartSpec["series"]): string {
  const us = topRoseSectors(series, (s) => s.side === "USN");
  const ij = topRoseSectors(series, (s) => s.side === "IJN");
  if (!us.length && !ij.length) {
    return "本片无取样舰艇，暂无方位结论。";
  }
  const usSet = new Set(us.map((t) => t.name));
  const overlap = ij.map((t) => t.name).filter((n) => usSet.has(n));
  let verdict: string;
  if (us.length && ij.length && us[0].name === ij[0].name) {
    verdict = `美日主峰同在 ${us[0].name}，该扇区对峙/接触风险偏高。`;
  } else if (us.length && ij.length && overlap.length) {
    verdict = `美日在 ${overlap.join("、")} 有交叠，接触扇区可优先盯。`;
  } else if (us.length && ij.length) {
    verdict = `美主 ${us[0].name}、日主 ${ij[0].name}，兵力分处不同扇区。`;
  } else {
    verdict = us.length ? "仅美方有取样落点。" : "仅日方有取样落点。";
  }
  return `结论：美方主在 ${formatRoseTops(us)}；日方主在 ${formatRoseTops(ij)}。${verdict}`;
}

function pickForceShips(pack: SlicePack, limit = 28): CompactUnit[] {
  const ships = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ]
    .filter((u) => u.unit_type === "Ship")
    .sort((a, b) => unitRankForScatter(a) - unitRankForScatter(b));

  const picked: CompactUnit[] = [];
  const bySide = { USN: 0, IJN: 0 };
  for (const u of ships) {
    const side = u.side === "IJN" ? "IJN" : "USN";
    const cap = unitRankForScatter(u) <= 1 ? 8 : 10;
    if (bySide[side] >= cap) continue;
    picked.push(u);
    bySide[side] += 1;
    if (picked.length >= limit) break;
  }
  return picked;
}

function forceGeoPoints(pack: SlicePack): {
  anchor: ReturnType<typeof findLandingAnchor>;
  points: ForceGeoPoint[];
} {
  const anchor = findLandingAnchor(pack);
  const points = pickForceShips(pack).map((u) => {
    const side = u.side === "IJN" ? ("IJN" as const) : ("USN" as const);
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    return {
      unit: u,
      side,
      eastNm,
      northNm,
      rangeNm,
      bearingDeg: bearingFromOffset(eastNm, northNm),
    };
  });
  return { anchor, points };
}

/**
 * 敌我位置相对登陆海域（中途岛）的空间散点。
 * 原点=中途岛；x=东向海里，y=北向海里。
 */
export function forceLandingScatterSeries(
  pack: SlicePack,
): ChartSpec["series"] {
  const { anchor, points: geos } = forceGeoPoints(pack);
  const points: ChartSpec["series"] = [
    {
      name: anchor.label,
      value: 0,
      x: 0,
      y: 0,
      side: "both",
      group: "登陆海域",
      detail: `登陆/目标海域锚点 · ${anchor.label}\n(${anchor.lat.toFixed(2)}°N, ${Math.abs(anchor.lon).toFixed(2)}°W)`,
    },
  ];

  for (const g of geos) {
    points.push({
      name: g.unit.name,
      value: g.rangeNm,
      x: g.eastNm,
      y: g.northNm,
      side: g.side,
      group: g.side === "USN" ? "美方" : "日方",
      detail: `${g.side === "USN" ? "美方" : "日方"} · ${g.unit.unit_class}\n相对${anchor.label}：东 ${g.eastNm} nm / 北 ${g.northNm} nm\n距离约 ${g.rangeNm} nm · 方位 ${Math.round(g.bearingDeg)}°`,
    });
  }
  return points;
}

/** 距中途岛海里：近→远条形（优先展示更贴近登陆海域的单位） */
export function forceRangeBarSeries(pack: SlicePack): ChartSpec["series"] {
  const { anchor, points } = forceGeoPoints(pack);
  return [...points]
    .filter((g) => g.rangeNm > 0.5)
    .sort((a, b) => a.rangeNm - b.rangeNm)
    .slice(0, 12)
    .map((g) => ({
      name: displayUnitName(g.unit.name, 20),
      value: g.rangeNm,
      side: g.side,
      detail: `${g.side === "USN" ? "美方" : "日方"} · ${g.unit.name}\n距${anchor.label}约 ${g.rangeNm} nm · 方位 ${Math.round(g.bearingDeg)}°`,
    }));
}

/** 相对中途岛的八方位兵力计数（美/日分列，供双序列雷达） */
export function forceBearingRoseSeries(pack: SlicePack): ChartSpec["series"] {
  const { points } = forceGeoPoints(pack);
  const counts: Record<string, { USN: number; IJN: number; names: string[] }> =
    Object.fromEntries(
      BEARING_SECTORS.map((s) => [s, { USN: 0, IJN: 0, names: [] as string[] }]),
    );

  for (const g of points) {
    if (g.rangeNm < 0.5) continue;
    const sec = bearingSector(g.bearingDeg);
    counts[sec][g.side] += 1;
    counts[sec].names.push(
      `${g.side === "USN" ? "美" : "日"}·${g.unit.name.replace(/^(USS|IJN)\s+/i, "")}`,
    );
  }

  return BEARING_SECTORS.flatMap((sec) => {
    const c = counts[sec];
    const detail = c.names.length
      ? c.names.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "该方位暂无取样舰艇";
    return [
      {
        name: sec,
        value: c.USN,
        side: "USN" as const,
        group: "美方",
        detail: `美方 · ${sec}\n${detail}`,
      },
      {
        name: sec,
        value: c.IJN,
        side: "IJN" as const,
        group: "日方",
        detail: `日方 · ${sec}\n${detail}`,
      },
    ];
  });
}

/** 在空剖面：东向 nm × 高度 km（与分布散点同系几何，多一维高度） */
export function airProfileScatterSeries(pack: SlicePack): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const aircraft = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ].filter((u) => u.unit_type === "Aircraft" && (u.altitude_m ?? 0) > 50);

  // 取样：各方最多 18，优先高空与航母相关机型
  const scored = aircraft
    .map((u) => {
      const alt = u.altitude_m ?? 0;
      const boost = /Zero|Dauntless|Kate|Val|Wildcat|无畏|零式|九七|九九/i.test(
        `${u.name} ${u.unit_class ?? ""}`,
      )
        ? 1
        : 0;
      return { u, score: alt + boost * 5000 };
    })
    .sort((a, b) => b.score - a.score);

  const picked: CompactUnit[] = [];
  const bySide = { USN: 0, IJN: 0 };
  for (const { u } of scored) {
    const side = u.side === "IJN" ? "IJN" : "USN";
    if (bySide[side] >= 18) continue;
    picked.push(u);
    bySide[side] += 1;
  }

  const points: ChartSpec["series"] = [
    {
      name: anchor.label,
      /** 仅占位；岛点大小由渲染层按锚点放大，不跟高度走 */
      value: 1,
      x: 0,
      y: 0,
      side: "both",
      group: "登陆海域",
      detail: `高度基准 · ${anchor.label}（东向 0 / 高度 0）`,
    },
  ];

  for (const u of picked) {
    const side = u.side === "IJN" ? ("IJN" as const) : ("USN" as const);
    const { eastNm, rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    const altKm = Math.round(((u.altitude_m ?? 0) / 1000) * 10) / 10;
    points.push({
      name: displayUnitName(u.name, 28),
      value: altKm,
      x: eastNm,
      y: altKm,
      side,
      group: side === "USN" ? "美方" : "日方",
      detail: `${u.name}\n东向 ${eastNm} nm · 高度 ${altKm} km\n距岛约 ${rangeNm} nm`,
    });
  }
  return points;
}

function findUnitByNameHints(
  pack: SlicePack,
  hints: RegExp[],
): CompactUnit | undefined {
  const units = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  for (const re of hints) {
    const hit = units.find((u) => re.test(u.name));
    if (hit) return hit;
  }
  return undefined;
}

function centroidOf(
  units: CompactUnit[],
): { lat: number; lon: number } | null {
  if (!units.length) return null;
  const lat =
    units.reduce((s, u) => s + u.latitude, 0) / units.length;
  const lon =
    units.reduce((s, u) => s + u.longitude, 0) / units.length;
  return { lat, lon };
}

function unitMatchesAnyHighlight(
  u: CompactUnit,
  highlights: string[],
): boolean {
  const uname = u.name.toLowerCase();
  return highlights.some((h) => {
    const full = h.trim().toLowerCase();
    const token = full.split(/\s+/).pop() ?? "";
    return (
      (full.length > 2 && (uname.includes(full) || full.includes(uname))) ||
      (token.length > 2 && uname.includes(token))
    );
  });
}

/** 条形/散点纵轴用短名：去掉舷号前缀，尽量标全舰名 */
function displayUnitName(name: string, max = 22): string {
  const s = name
    .replace(/^(USS|IJN)\s+/i, "")
    .replace(/^CVA-\d+\s+/i, "")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function shortUnitLabel(u: CompactUnit, max = 18): string {
  return displayUnitName(u.name, max);
}

/** 关联距离远近分档：颜色 + 研判含义（海里） */
export const HUNT_RANGE_BANDS = [
  {
    id: "near",
    /** 半开区间上界，nm < maxExclusive */
    maxExclusive: 50,
    color: "#c45c4a",
    shortLabel: "贴身",
    rangeLabel: "<50 nm",
    meaning: "掩护有效或打击临近，时间窗口紧迫",
  },
  {
    id: "mid",
    maxExclusive: 120,
    color: "#d4a017",
    shortLabel: "可及",
    rangeLabel: "50–120 nm",
    meaning: "舰载机航程内，仍有机动/反应余地",
  },
  {
    id: "far",
    maxExclusive: Number.POSITIVE_INFINITY,
    color: "#64748b",
    shortLabel: "疏远",
    rangeLabel: ">120 nm",
    meaning: "接触尚远，或护航易脱节、猎杀未到位",
  },
] as const;

export type HuntRangeBand = (typeof HUNT_RANGE_BANDS)[number];

export function huntRangeBand(nm: number): HuntRangeBand {
  const v = Number.isFinite(nm) ? Math.max(0, nm) : 0;
  for (const b of HUNT_RANGE_BANDS) {
    if (v < b.maxExclusive) return b;
  }
  return HUNT_RANGE_BANDS[HUNT_RANGE_BANDS.length - 1];
}

function withHuntRangeBand(
  row: ChartSpec["series"][number],
): ChartSpec["series"][number] {
  const band = huntRangeBand(row.value);
  const base = (row.detail ?? "").trim();
  return {
    ...row,
    group: band.shortLabel,
    detail: [
      base,
      `【${band.shortLabel} ${band.rangeLabel}】${band.meaning}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** 无高亮时回退：赤城猎杀模板（晚段叙事） */
function huntRangeAkagiFallback(pack: SlicePack): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const enterprise = findUnitByNameHints(pack, [/Enterprise/i, /企业/]);
  const akagi = findUnitByNameHints(pack, [/Akagi/i, /赤城/]);
  const zeros = [...(pack.sides.IJN?.units ?? [])].filter(
    (u) =>
      u.unit_type === "Aircraft" &&
      /Zero|零式/i.test(`${u.name} ${u.unit_class ?? ""}`) &&
      (u.altitude_m ?? 0) > 50,
  );
  const dauntless = [...(pack.sides.USN?.units ?? [])].filter(
    (u) =>
      u.unit_type === "Aircraft" &&
      /Dauntless|无畏/i.test(`${u.name} ${u.unit_class ?? ""}`) &&
      (u.altitude_m ?? 0) > 50,
  );

  const rows: ChartSpec["series"] = [];

  if (akagi) {
    const { rangeNm } = nmOffsetFrom(
      akagi.latitude,
      akagi.longitude,
      anchor.lat,
      anchor.lon,
    );
    rows.push({
      name: "赤城→中途岛",
      value: rangeNm,
      side: "IJN",
      detail: `回退模板 · 伤舰距岛约 ${rangeNm} nm`,
    });
  }
  if (enterprise && akagi) {
    const { rangeNm } = nmOffsetFrom(
      akagi.latitude,
      akagi.longitude,
      enterprise.latitude,
      enterprise.longitude,
    );
    rows.push({
      name: "TF16→赤城",
      value: rangeNm,
      side: "USN",
      detail: `回退模板 · Enterprise 至赤城约 ${rangeNm} nm`,
    });
  }
  const zc = centroidOf(zeros);
  if (zc && akagi) {
    const { rangeNm } = nmOffsetFrom(
      zc.lat,
      zc.lon,
      akagi.latitude,
      akagi.longitude,
    );
    rows.push({
      name: "零式质心→赤城",
      value: rangeNm,
      side: "IJN",
      detail: `回退模板 · 在空零式相对母舰约 ${rangeNm} nm`,
    });
  }
  const dc = centroidOf(dauntless);
  if (dc && akagi) {
    const { rangeNm } = nmOffsetFrom(
      dc.lat,
      dc.lon,
      akagi.latitude,
      akagi.longitude,
    );
    rows.push({
      name: "无畏质心→赤城",
      value: rangeNm,
      side: "USN",
      detail: `回退模板 · 在空无畏相对赤城约 ${rangeNm} nm`,
    });
  }

  if (!rows.length) {
    return [{ name: "（无关键距离）", value: 0, detail: "无高亮且缺航母取样" }];
  }
  return rows
    .sort((a, b) => b.value - a.value)
    .map(withHuntRangeBand);
}

/**
 * 关键距离阶梯：优先本片高亮实体↔岛 / 高亮两两；
 * 无高亮可定位时回退赤城猎杀模板。条色按远近分档。
 */
export function huntRangeSeries(
  pack: SlicePack,
  spec?: SituationViewSpec,
): ChartSpec["series"] {
  const highlights = spec?.map?.highlight_names ?? [];
  if (!highlights.length) return huntRangeAkagiFallback(pack);

  const anchor = findLandingAnchor(pack);
  const seen = new Set<string>();
  const units: CompactUnit[] = [];
  for (const u of [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ]) {
    if (u.unit_type !== "Ship" && u.unit_type !== "Facility") continue;
    if (!unitMatchesAnyHighlight(u, highlights)) continue;
    if (seen.has(u.name)) continue;
    seen.add(u.name);
    units.push(u);
    if (units.length >= 6) break;
  }

  if (!units.length) return huntRangeAkagiFallback(pack);

  const rows: ChartSpec["series"] = [];
  for (const u of units) {
    const { rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    const side = u.side === "IJN" ? ("IJN" as const) : ("USN" as const);
    rows.push({
      name: `${shortUnitLabel(u, 16)}→岛`,
      value: rangeNm,
      side,
      detail: `高亮 · ${u.name} 距中途岛约 ${rangeNm} nm`,
    });
  }

  const pairs: [CompactUnit, CompactUnit][] = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      pairs.push([units[i], units[j]]);
    }
  }
  pairs.sort((a, b) => {
    const crossA = (a[0].side === "IJN") !== (a[1].side === "IJN") ? 0 : 1;
    const crossB = (b[0].side === "IJN") !== (b[1].side === "IJN") ? 0 : 1;
    return crossA - crossB;
  });
  for (const [a, b] of pairs.slice(0, 3)) {
    const { rangeNm } = nmOffsetFrom(
      a.latitude,
      a.longitude,
      b.latitude,
      b.longitude,
    );
    const side =
      a.side === "IJN" && b.side === "IJN"
        ? ("IJN" as const)
        : a.side !== "IJN" && b.side !== "IJN"
          ? ("USN" as const)
          : undefined;
    rows.push({
      name: `${shortUnitLabel(a, 12)}↔${shortUnitLabel(b, 12)}`,
      value: rangeNm,
      side,
      detail: `高亮两两 · ${a.name} ↔ ${b.name} 约 ${rangeNm} nm`,
    });
  }

  return rows
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map(withHuntRangeBand);
}

/** 意图：只画高亮实体 + 活动区圆心（证据落点，不是全场兵力） */
export function evidenceFocusScatterSeries(
  pack: SlicePack,
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const all = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  const highlights = spec.map?.highlight_names ?? [];
  const points: ChartSpec["series"] = [
    {
      name: anchor.label,
      value: 0,
      x: 0,
      y: 0,
      side: "both",
      group: "登陆海域",
      detail: "中途岛锚点",
    },
  ];

  const matchHighlight = (u: CompactUnit) => {
    const uname = u.name.toLowerCase();
    return highlights.some((h) => {
      const full = h.trim().toLowerCase();
      const token = full.split(/\s+/).pop() ?? "";
      return (
        (full.length > 2 && (uname.includes(full) || full.includes(uname))) ||
        (token.length > 2 && uname.includes(token))
      );
    });
  };

  for (const u of all) {
    if (u.unit_type !== "Ship" && u.unit_type !== "Facility") continue;
    if (!highlights.length || !matchHighlight(u)) continue;
    const side = u.side === "IJN" ? ("IJN" as const) : ("USN" as const);
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    points.push({
      name: displayUnitName(u.name, 22),
      value: rangeNm,
      x: eastNm,
      y: northNm,
      side,
      group: side === "USN" ? "美方" : "日方",
      detail: `高亮实体 · ${u.name}\n东 ${eastNm} / 北 ${northNm} nm`,
    });
  }

  for (const z of spec.map?.threat_zones ?? []) {
    if (!z.center) continue;
    const [lat, lon] = z.center;
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      lat,
      lon,
      anchor.lat,
      anchor.lon,
    );
    points.push({
      name: (z.label || z.id).slice(0, 18),
      value: rangeNm,
      x: eastNm,
      y: northNm,
      side: z.side === "USN" || z.side === "IJN" ? z.side : "both",
      group: "活动区",
      detail: `活动区圆心 · ${z.label}（${z.level}）\n东 ${eastNm} / 北 ${northNm} nm`,
    });
  }

  return points.length > 1
    ? points
    : [
        ...points,
        {
          name: "（无高亮）",
          value: 0,
          x: 0,
          y: 5,
          detail: "本侧未给出可定位高亮实体",
        },
      ];
}

/** 活动区足迹：圆心落点 + value≈半径 nm（点大小可读） */
export function zoneFootprintScatterSeries(
  pack: SlicePack,
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const points: ChartSpec["series"] = [
    {
      name: anchor.label,
      value: 2,
      x: 0,
      y: 0,
      side: "both",
      group: "登陆海域",
      detail: "中途岛锚点",
    },
  ];
  for (const z of spec.map?.threat_zones ?? []) {
    if (!z.center) continue;
    const [lat, lon] = z.center;
    const { eastNm, northNm } = nmOffsetFrom(
      lat,
      lon,
      anchor.lat,
      anchor.lon,
    );
    const r = Math.max(2, z.radius_nm ?? 8);
    points.push({
      name: (z.label || z.id).slice(0, 16),
      value: r,
      x: eastNm,
      y: northNm,
      side: z.side === "USN" || z.side === "IJN" ? z.side : "both",
      group: z.level || "活动区",
      detail: `${z.label}（${z.level}）\n圆心东 ${eastNm} / 北 ${northNm} nm\n半径 ${z.radius_nm ?? "?"} nm`,
    });
  }
  return points.length > 1
    ? points
    : [
        ...points,
        {
          name: "（无活动区）",
          value: 1,
          x: 0,
          y: 4,
          detail: "本侧未画活动区",
        },
      ];
}

/** 作战指向起/终点：相对中途岛八方位计数（玫瑰；看扇区，不铺散点） */
export function axisGeometryRoseSeries(
  pack: SlicePack,
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const counts: Record<
    string,
    { from: number; to: number; names: string[] }
  > = Object.fromEntries(
    BEARING_SECTORS.map((s) => [s, { from: 0, to: 0, names: [] as string[] }]),
  );

  for (const a of spec.map?.axes ?? []) {
    const label = (a.label || a.id || "指向").slice(0, 20);
    const sideTag =
      a.side === "USN" ? "美" : a.side === "IJN" ? "日" : "?";
    if (a.from) {
      const [lat, lon] = a.from;
      const { eastNm, northNm, rangeNm } = nmOffsetFrom(
        lat,
        lon,
        anchor.lat,
        anchor.lon,
      );
      if (rangeNm >= 0.5) {
        const sec = bearingSector(bearingFromOffset(eastNm, northNm));
        counts[sec].from += 1;
        counts[sec].names.push(
          `${sideTag}·${label}·起（约 ${rangeNm} nm）`,
        );
      }
    }
    if (a.to) {
      const [lat, lon] = a.to;
      const { eastNm, northNm, rangeNm } = nmOffsetFrom(
        lat,
        lon,
        anchor.lat,
        anchor.lon,
      );
      if (rangeNm >= 0.5) {
        const sec = bearingSector(bearingFromOffset(eastNm, northNm));
        counts[sec].to += 1;
        counts[sec].names.push(
          `${sideTag}·${label}·终（约 ${rangeNm} nm）`,
        );
      }
    }
  }

  return BEARING_SECTORS.flatMap((sec) => {
    const c = counts[sec];
    const detail = c.names.length
      ? c.names.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "该方位暂无轴线端点";
    return [
      {
        name: sec,
        value: c.from,
        group: "起点",
        detail: `起点 · ${sec}\n${detail}`,
      },
      {
        name: sec,
        value: c.to,
        group: "终点",
        detail: `终点 · ${sec}\n${detail}`,
      },
    ];
  });
}

/** 在空高度带：美/日分组柱（结构分布，不是数轴条数） */
export function altBandsSeries(pack: SlicePack): ChartSpec["series"] {
  const bands = [
    { name: "0–3 km", lo: 50, hi: 3000 },
    { name: "3–6 km", lo: 3000, hi: 6000 },
    { name: "6–9 km", lo: 6000, hi: 9000 },
    { name: "≥9 km", lo: 9000, hi: 1e9 },
  ] as const;

  const aircraft = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ].filter((u) => u.unit_type === "Aircraft" && (u.altitude_m ?? 0) > 50);

  const out: ChartSpec["series"] = [];
  for (const b of bands) {
    const usn = aircraft.filter(
      (u) =>
        u.side !== "IJN" &&
        (u.altitude_m ?? 0) >= b.lo &&
        (u.altitude_m ?? 0) < b.hi,
    ).length;
    const ijn = aircraft.filter(
      (u) =>
        u.side === "IJN" &&
        (u.altitude_m ?? 0) >= b.lo &&
        (u.altitude_m ?? 0) < b.hi,
    ).length;
    out.push({
      name: b.name,
      value: usn,
      side: "USN",
      group: "美方",
      detail: `美方在空 ${usn} 架 · ${b.name}`,
    });
    out.push({
      name: b.name,
      value: ijn,
      side: "IJN",
      group: "日方",
      detail: `日方在空 ${ijn} 架 · ${b.name}`,
    });
  }
  return out;
}

/** 高亮实体距中途岛（海里条） */
export function highlightRangeSeries(
  pack: SlicePack,
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const anchor = findLandingAnchor(pack);
  const all = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  const highlights = spec.map?.highlight_names ?? [];
  const matchHighlight = (u: CompactUnit) => {
    const uname = u.name.toLowerCase();
    return highlights.some((h) => {
      const full = h.trim().toLowerCase();
      const token = full.split(/\s+/).pop() ?? "";
      return (
        (full.length > 2 && (uname.includes(full) || full.includes(uname))) ||
        (token.length > 2 && uname.includes(token))
      );
    });
  };

  const rows: ChartSpec["series"] = [];
  for (const u of all) {
    if (u.unit_type !== "Ship" && u.unit_type !== "Facility") continue;
    if (!highlights.length || !matchHighlight(u)) continue;
    const { rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    rows.push({
      name: displayUnitName(u.name, 22),
      value: rangeNm,
      side: u.side === "IJN" ? "IJN" : "USN",
      detail: `${u.name} 距中途岛约 ${rangeNm} nm`,
    });
  }
  return rows.length
    ? rows.sort((a, b) => b.value - a.value).slice(0, 8)
    : [{ name: "（无高亮）", value: 0, detail: "无高亮实体可测距" }];
}

function buildSpatialRelationCharts(
  pack?: SlicePack,
  spec?: SituationViewSpec,
): ChartSpec[] {
  if (!pack) return [];
  const landing = forceLandingScatterSeries(pack);
  if (landing.length < 2) return [];

  const bearing = forceBearingRoseSeries(pack);
  const air = airProfileScatterSeries(pack);

  return [
    {
      id: "cmp-force-landing",
      type: "scatter",
      title: "敌我位置与登陆海域关系",
      description: "原点=中途岛；横轴东向海里，纵轴北向海里；红美蓝日",
      series: landing,
    },
    {
      id: "cmp-force-bearing",
      type: "radar",
      title: "问：相对岛，敌我方位扇区如何分布？（方位玫瑰）",
      description: "美/日舰艇相对中途岛八方位计数；突起=兵力所在扇区",
      series: bearing,
    },
    {
      id: "cmp-air-profile",
      type: "scatter",
      title: "问：在空飞机相对岛的东向×高度？",
      description: "横轴东向 nm，纵轴高度 km",
      series: air,
    },
    {
      id: "cmp-hunt-range",
      type: "hbar",
      title: "问：本片关键间隔各多少海里？",
      description:
        "高亮优先；条色=贴身/可及/疏远，说明远近研判含义",
      series: huntRangeSeries(pack, spec),
    },
    {
      id: "cmp-alt-bands",
      type: "grouped_bar",
      title: "问：美/日在空兵力落在哪些高度带？",
      description: "分组柱：各高度带架次（结构分布）",
      series: altBandsSeries(pack),
    },
  ];
}

/** 证据充分度 0–4：有无证据 + 信息量，比「字数散点」更易读 */
function evidenceStrengthScore(evidence?: string): number {
  const t = (evidence ?? "").trim();
  if (!t) return 0;
  if (t.length < 24) return 1;
  if (t.length < 60) return 2;
  if (t.length < 120) return 3;
  return 4;
}

function threatEvidenceSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  return [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .map((r) => {
      const score = evidenceStrengthScore(r.evidence);
      return {
        name: r.target,
        value: score,
        detail: r.evidence?.trim()
          ? `充分度 ${score}/4 — ${r.evidence.trim()}`
          : `充分度 0/4 — 暂无证据（${r.level}）`,
      };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh"))
    .slice(0, 8);
}

function normalizeThreatLevel(level: string): "紧急" | "高" | "中" | "低" {
  if (/紧急/.test(level)) return "紧急";
  if (/高/.test(level)) return "高";
  if (/中/.test(level)) return "中";
  return "低";
}

/** 桑基：充分度档 → 威胁等级 */
function threatSankeySeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const bag = new Map<string, number>();
  for (const r of ratings ?? []) {
    if (!r.target) continue;
    const src = `充分度${evidenceStrengthScore(r.evidence)}`;
    const tgt = normalizeThreatLevel(r.level);
    const key = `${src}→${tgt}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  if (!bag.size) {
    return [{ name: "充分度0", group: "低", value: 0, detail: "暂无流向" }];
  }
  return [...bag.entries()].map(([key, value]) => {
    const [name, group] = key.split("→");
    return {
      name,
      group,
      value,
      detail: `${name} → ${group}：${value} 条目标`,
    };
  });
}

/** 桑基：证据类型 → 权重档 */
function intentSankeySeries(
  items: { kind: string; text: string }[],
): ChartSpec["series"] {
  const weightLabel = (kind: string) =>
    kind === "方向" ? "高权重" : kind === "关键实体" ? "中权重" : "低权重";
  const bag = new Map<string, number>();
  for (const i of items) {
    const src = i.kind;
    const tgt = weightLabel(i.kind);
    const key = `${src}→${tgt}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  if (!bag.size) {
    return [{ name: "方向", group: "高权重", value: 0, detail: "暂无流向" }];
  }
  return [...bag.entries()].map(([key, value]) => {
    const [name, group] = key.split("→");
    return {
      name,
      group,
      value,
      detail: `${name} → ${group}：${value} 条`,
    };
  });
}

export type CompareChartOptions = {
  /**
   * true=有范式：从扩展池按 M→T 选图；
   * false=无范式：从扩展池按启发式另选一套（数量相同、问句不同）。
   */
  rich?: boolean;
  /** 有切片兵力坐标时，可生成「敌我×登陆海域」空间散点 */
  pack?: SlicePack;
};

function applyVmmpChartSelection(
  charts: ChartSpec[],
  taskFocus: TaskFocus,
  rich: boolean,
): ChartSpec[] {
  const { ids, whyById } = selectChartSlotIds(taskFocus, rich);
  return charts
    .filter((c) => c.id && ids.has(c.id))
    .map((c) => ({
      ...c,
      why_type: whyById.get(c.id) || c.why_type,
    }));
}

/**
 * 单切片任务认知图槽：先生成候选图，再按 VMMP M/T（有范式）或基线（无范式）筛选。
 */
export function buildTaskCompareCharts(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  packPhase?: string,
  options?: CompareChartOptions,
): ChartSpec[] {
  const rich = options?.rich !== false;
  const spatialCharts = buildSpatialRelationCharts(options?.pack, spec);

  if (taskFocus === "intent") {
    const evidence = evidenceCompositionSeries(spec);
    const landing = spatialCharts.filter((c) => c.id === "cmp-force-landing");
    const alt = spatialCharts.filter((c) => c.id === "cmp-alt-bands");
    const pack = options?.pack;
    const candidates: ChartSpec[] = [
      ...landing,
      ...alt,
      {
        id: "cmp-intent-evidence",
        type: "pie",
        title: "证据构成",
        description: "Direction / Entity / Zone 占比",
        series: evidence,
      },
      {
        id: "cmp-evidence-focus",
        type: "scatter",
        title: "问：高亮实体/圈心相对岛在哪？",
        description: "只画高亮与活动区圆心",
        series: pack ? evidenceFocusScatterSeries(pack, spec) : [],
      },
      {
        id: "cmp-axis-geometry",
        type: "radar",
        title: "问：轴线起终点落在哪些方位扇区？",
        description:
          "起点=发起扇区，终点=指向扇区；与兵力玫瑰对照声明是否合拍",
        series: pack ? axisGeometryRoseSeries(pack, spec) : [],
      },
      {
        id: "cmp-highlight-range",
        type: "hbar",
        title: "问：高亮实体距中途岛各多少海里？",
        description: "条长=真实距离",
        series: pack ? highlightRangeSeries(pack, spec) : [],
      },
    ];
    return applyVmmpChartSelection(candidates, "intent", rich);
  }

  const ratings = (spec.threat_ratings ?? [])
    .filter((r) => perspectiveBucket(r.perspective ?? "") === "红方看蓝方")
    .flatMap((r) =>
      expandBundledShipTarget(r.target).map((target) => ({ ...r, target })),
    );
  const levelCounts = (["紧急", "高", "中", "低"] as const).map((lv) => ({
    name: lv,
    value: ratings.filter((r) => normalizeThreatLevel(r.level) === lv).length,
    detail: lv,
  }));
  const candidates: ChartSpec[] = [
    ...spatialCharts,
    {
      id: "cmp-threat-rank",
      type: "hbar",
      title: "威胁目标排序",
      description: "条长=等级分（1–4）；悬停看证据",
      series: threatRankSeries(ratings),
    },
    {
      id: "cmp-threat-level-bar",
      type: "bar",
      title: "威胁等级分布",
      description: "紧急/高/中/低条数",
      series: levelCounts,
    },
  ];
  return applyVmmpChartSelection(candidates, "threat", rich);
}

/**
 * 空间研判界面底部三槽：分布 → 排序；其余进补充区。
 * 对齐「先看空间分布，再看优先级排序，证据栏单独用文字」的设计路径。
 */
export function pickStudySlotCharts(
  charts: ChartSpec[],
  taskFocus: TaskFocus,
): {
  distribution?: ChartSpec;
  ranking?: ChartSpec;
  /** 距岛距离 + 方位玫瑰，与散点并列试看 */
  spatialExtras: ChartSpec[];
  extras: ChartSpec[];
} {
  const byId = (id: string) => charts.find((c) => c.id === id);
  const used = new Set<string>();

  let distribution: ChartSpec | undefined;
  let ranking: ChartSpec | undefined;

  if (taskFocus === "threat") {
    distribution =
      byId("cmp-force-landing") ||
      charts.find((c) => c.type === "scatter" || c.type === "bar");
    ranking =
      byId("cmp-threat-rank") ||
      charts.find(
        (c) => c.type === "hbar" && c.id !== distribution?.id,
      );
  } else {
    distribution =
      byId("cmp-force-landing") ||
      byId("cmp-intent-phase") ||
      charts.find((c) => c.type === "scatter" || c.type === "bar");
    ranking =
      byId("cmp-intent-rank") ||
      byId("cmp-intent-evidence") ||
      charts.find(
        (c) =>
          (c.type === "hbar" || c.type === "pie") &&
          c.id !== distribution?.id,
      ) ||
      charts.find((c) => c.id !== distribution?.id);
  }

  const spatialExtras = [
    byId("cmp-force-bearing"),
    byId("cmp-air-profile"),
    byId("cmp-hunt-range"),
    byId("cmp-alt-bands"),
    byId("cmp-evidence-focus"),
    byId("cmp-axis-geometry"),
    byId("cmp-highlight-range"),
  ].filter((c): c is ChartSpec => Boolean(c));

  if (distribution?.id) used.add(distribution.id);
  if (ranking?.id) used.add(ranking.id);
  for (const c of spatialExtras) used.add(c.id);

  const extras = charts.filter((c) => c.id && !used.has(c.id));
  return { distribution, ranking, spatialExtras, extras };
}

