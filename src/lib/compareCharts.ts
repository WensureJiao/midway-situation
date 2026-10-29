import type {
  ChartSpec,
  ChartType,
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

/** 作战指向：每条轴的方位° × 长度 nm（从图上虚线量出来，不是数条数） */
export function axisVectorScatterSeries(
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const axes = spec.map?.axes ?? [];
  const rows: ChartSpec["series"] = [];
  for (const a of axes) {
    if (!a.from || !a.to) continue;
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      a.to[0],
      a.to[1],
      a.from[0],
      a.from[1],
    );
    if (rangeNm < 1) continue;
    const bearing = Math.round(bearingFromOffset(eastNm, northNm));
    const label = (a.label || a.id).trim();
    rows.push({
      name: label.length > 20 ? `${label.slice(0, 18)}…` : label,
      value: rangeNm,
      x: bearing,
      y: rangeNm,
      side: a.side === "IJN" ? "IJN" : "USN",
      detail: `${label}\n${a.side === "USN" ? "美方" : "日方"}作战指向\n方位 ${bearing}° · 长 ${rangeNm} nm\n${fmtLatLon(a.from)} → ${fmtLatLon(a.to)}`,
    });
  }
  return rows.length
    ? rows
    : [
        {
          name: "（无作战指向）",
          value: 0,
          x: 0,
          y: 0,
          detail: "本侧未画出轴线",
        },
      ];
}

export function buildAxisVectorChart(spec: SituationViewSpec): ChartSpec {
  return {
    id: "cmp-intent-axes",
    type: "scatter",
    title: "图上作战指向朝哪、各多长？",
    description: "横轴方位°，纵轴长度 nm；红美蓝日 — 对照地图虚线轴",
    series: axisVectorScatterSeries(spec),
  };
}

/** 关注圈半径：每圈多大多急，地图上不好比大小 */
export function zoneRadiusBarSeries(
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const zones = spec.map?.threat_zones ?? [];
  if (!zones.length) {
    return [{ name: "（无活动区）", value: 0, detail: "未画关注圈" }];
  }
  return [...zones]
    .map((z) => {
      const lv = String(z.level || "");
      const label = (z.label || z.id).trim();
      const short = label.length > 16 ? `${label.slice(0, 14)}…` : label;
      return {
        name: short,
        value: Math.round((z.radius_nm ?? 0) * 10) / 10,
        group: lv,
        detail: `${label}\n等级 ${lv || "未标"} · 半径 ${z.radius_nm ?? "?"} nm`,
      };
    })
    .sort((a, b) => b.value - a.value);
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

/** 指向玫瑰用十六方位：两条近角轴（如 128° / 156°）不会并进同一瓣 */
const INTENT_ROSE_SECTORS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

function intentRoseSector(
  bearingDeg: number,
): (typeof INTENT_ROSE_SECTORS)[number] {
  const deg = ((bearingDeg % 360) + 360) % 360;
  const idx = Math.round(deg / 22.5) % 16;
  return INTENT_ROSE_SECTORS[idx];
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

/** 作战指向雷达/散点：由各轴长度生成看图结论 */
export function concludeIntentAxes(
  series: ChartSpec["series"],
  asRadar = false,
): string {
  const rows = [...(series ?? [])]
    .filter(
      (s) =>
        s.name &&
        !/（无/.test(s.name) &&
        (Number(s.value) || Number(s.y) || 0) > 0,
    )
    .map((s) => ({
      name: s.name,
      nm: Math.round(Number(s.value) || Number(s.y) || 0),
      bearing: Math.round(Number(s.x) || 0),
      side: s.side === "IJN" ? "IJN" : "USN",
    }))
    .sort((a, b) => b.nm - a.nm);
  if (!rows.length) {
    return asRadar
      ? "本侧未画作战指向，图上无瓣。"
      : "本侧未画作战指向，图上无点。";
  }
  const us = rows.filter((r) => r.side === "USN");
  const ij = rows.filter((r) => r.side === "IJN");
  const fmt = (r: (typeof rows)[number]) =>
    `「${r.name}」${r.nm} nm（${r.bearing}°）`;
  const bits: string[] = [];
  if (ij[0]) bits.push(`日方主轴 ${fmt(ij[0])}`);
  if (us[0]) bits.push(`美方主轴 ${fmt(us[0])}`);
  const mark = asRadar ? "瓣" : "点";
  let verdict: string;
  if (ij[0] && us[0]) {
    verdict =
      ij[0].nm >= us[0].nm
        ? `日方指向更长，主作战方向先看蓝${mark}。`
        : `美方指向更长，主作战方向先看红${mark}。`;
  } else if (ij[0]) {
    verdict = asRadar
      ? "只有日方轴：看蓝瓣落在哪一格、有多长。"
      : "只有日方轴：看蓝点落在哪一方位、有多高。";
  } else {
    verdict = asRadar
      ? "只有美方轴：看红瓣落在哪一格、有多长。"
      : "只有美方轴：看红点落在哪一方位、有多高。";
  }
  return `结论：${bits.join("；")}。${verdict}`;
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

/** 距中途岛海里：近→远条形，条长就是海里 */
export function forceRangeBarSeries(pack: SlicePack): ChartSpec["series"] {
  const { anchor, points } = forceGeoPoints(pack);
  const ranked = [...points]
    .filter((g) => g.rangeNm > 0.5)
    .sort((a, b) => a.rangeNm - b.rangeNm);
  const us = ranked.filter((g) => g.side === "USN").slice(0, 8);
  const ij = ranked.filter((g) => g.side === "IJN").slice(0, 8);
  return [...us, ...ij]
    .sort((a, b) => a.rangeNm - b.rangeNm)
    .map((g) => ({
      name: displayUnitName(g.unit.name, 18),
      value: Math.round(g.rangeNm),
      side: g.side,
      detail: `${g.side === "USN" ? "美方" : "日方"} · ${g.unit.name}\n距${anchor.label} ${Math.round(g.rangeNm)} nm · 方位 ${Math.round(g.bearingDeg)}°`,
    }));
}

/** 美/日 × 距岛档（贴身/可及/疏远）热力：看兵力远近结构，不堆条形 */
export function forceRangeHeatSeries(pack: SlicePack): ChartSpec["series"] {
  const { points } = forceGeoPoints(pack);
  const bag = new Map<string, { n: number; names: string[] }>();
  for (const side of ["美方", "日方"] as const) {
    for (const b of HUNT_RANGE_BANDS) {
      bag.set(`${side}|${b.shortLabel}`, { n: 0, names: [] });
    }
  }
  for (const g of points) {
    if (g.rangeNm <= 0.5) continue;
    const side = g.side === "IJN" ? "日方" : "美方";
    const band = huntRangeBand(g.rangeNm);
    const key = `${side}|${band.shortLabel}`;
    const cell = bag.get(key)!;
    cell.n += 1;
    if (cell.names.length < 4) {
      cell.names.push(displayUnitName(g.unit.name, 14));
    }
  }
  return [...bag.entries()].map(([key, cell]) => {
    const [group, name] = key.split("|");
    const band = HUNT_RANGE_BANDS.find((b) => b.shortLabel === name)!;
    return {
      name,
      group,
      value: cell.n,
      side: group === "日方" ? ("IJN" as const) : ("USN" as const),
      detail: cell.n
        ? `${group}·${name}（${band.rangeLabel}）${cell.n} 艘\n${cell.names.join("、")}${cell.n > cell.names.length ? "…" : ""}\n${band.meaning}`
        : `${group}·${name}：无取样`,
    };
  });
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

/** 作战指向 → 十六方位玫瑰（半径=海里）；比兵力方位图更细，避免近角轴并瓣 */
export function intentAxesRoseRadarData(
  series: ChartSpec["series"],
): { name: string; 美方: number; 日方: number; detail: string }[] {
  const bag = Object.fromEntries(
    INTENT_ROSE_SECTORS.map((s) => [
      s,
      { USN: 0, IJN: 0, notes: [] as string[] },
    ]),
  ) as Record<
    (typeof INTENT_ROSE_SECTORS)[number],
    { USN: number; IJN: number; notes: string[] }
  >;

  for (const s of series ?? []) {
    if (!s.name || /（无/.test(s.name)) continue;
    const nm = Number(s.value) || Number(s.y) || 0;
    if (nm <= 0) continue;
    const sec = intentRoseSector(Number(s.x) || 0);
    const side = s.side === "IJN" ? "IJN" : "USN";
    if (nm > bag[sec][side]) bag[sec][side] = nm;
    bag[sec].notes.push(
      `${side === "IJN" ? "日" : "美"}·${s.name} ${Math.round(nm)} nm · ${Math.round(Number(s.x) || 0)}°`,
    );
  }

  return INTENT_ROSE_SECTORS.map((sec) => ({
    name: sec,
    美方: bag[sec].USN,
    日方: bag[sec].IJN,
    detail: bag[sec].notes.length
      ? bag[sec].notes.join("\n")
      : "该方位无作战指向",
  }));
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
    .sort((a, b) => a.value - b.value)
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

/** 高亮实体距中途岛：方位° × 距离 nm 散点（替代条形堆叠） */
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
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    const bearing = Math.round(bearingFromOffset(eastNm, northNm));
    const band = huntRangeBand(rangeNm);
    rows.push({
      name: displayUnitName(u.name, 22),
      value: rangeNm,
      x: bearing,
      y: rangeNm,
      side: u.side === "IJN" ? "IJN" : "USN",
      group: band.shortLabel,
      detail: `${u.name}\n方位 ${bearing}° · 距岛 ${rangeNm} nm\n【${band.shortLabel} ${band.rangeLabel}】${band.meaning}`,
    });
  }
  return rows.length
    ? rows.sort((a, b) => (b.y ?? 0) - (a.y ?? 0)).slice(0, 10)
    : [
        {
          name: "（无高亮）",
          value: 0,
          x: 0,
          y: 0,
          detail: "无高亮实体可测距",
        },
      ];
}

/** 关联距离 → 贴身/可及/疏远 构成饼 */
export function huntRangeBandPieSeries(
  pack: SlicePack,
  spec?: SituationViewSpec,
): ChartSpec["series"] {
  const rows = huntRangeSeries(pack, spec).filter(
    (r) => (Number(r.value) || 0) > 0 && r.name && !/（无/.test(r.name),
  );
  return HUNT_RANGE_BANDS.map((b) => {
    const hit = rows.filter((r) => huntRangeBand(r.value).id === b.id);
    return {
      name: b.shortLabel,
      value: hit.length,
      group: b.rangeLabel,
      detail: hit.length
        ? `【${b.shortLabel} ${b.rangeLabel}】${b.meaning}\n${hit
            .map((r, i) => `${i + 1}. ${r.name}（${r.value} nm）`)
            .join("\n")}`
        : `【${b.shortLabel}】暂无关联落入此档`,
    };
  });
}

/** 威胁：充分度 × 等级 散点（看证据是否撑得住定级） */
export function threatEvidenceScatterSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const levelY = (level: string) => {
    const lv = normalizeThreatLevel(level);
    if (lv === "紧急") return 4;
    if (lv === "高") return 3;
    if (lv === "中") return 2;
    return 1;
  };
  const rows = [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .map((r) => {
      const score = evidenceStrengthScore(r.evidence);
      const y = levelY(r.level);
      return {
        name: r.target,
        value: score,
        x: score,
        y,
        group: normalizeThreatLevel(r.level),
        detail: r.evidence?.trim()
          ? `充分度 ${score}/4 · 等级 ${normalizeThreatLevel(r.level)}\n${r.evidence.trim()}`
          : `充分度 0/4 · 等级 ${normalizeThreatLevel(r.level)} — 暂无证据`,
      };
    })
    .sort((a, b) => b.y - a.y || b.x - a.x)
    .slice(0, 12);
  return rows.length
    ? rows
    : [{ name: "（无条目）", value: 0, x: 0, y: 0, detail: "暂无威胁条目" }];
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
      title: "相对岛，敌我方位扇区如何分布？",
      description: "美/日舰艇相对中途岛八方位计数；突起=兵力所在扇区",
      series: bearing,
    },
    {
      id: "cmp-air-profile",
      type: "scatter",
      title: "在空飞机相对岛的东向×高度？",
      description: "横轴东向 nm，纵轴高度 km",
      series: air,
    },
    {
      id: "cmp-hunt-range",
      type: "hbar",
      title: "高亮之间/对岛间隔有多远？",
      description: "条长=海里；越短越近。悬停看具体关联",
      series: huntRangeSeries(pack, spec),
    },
    {
      id: "cmp-alt-bands",
      type: "multi_line",
      title: "美/日在空兵力落在哪些高度带？",
      description: "折线：各高度带架次走势（美/日对照）",
      series: altBandsSeries(pack),
    },
    {
      id: "cmp-force-range",
      type: "hbar",
      title: "各舰距中途岛多远？",
      description: "条长=海里；越短越近。红美蓝日",
      series: forceRangeBarSeries(pack),
    },
    ...(spec
      ? [
          {
            id: "cmp-zone-footprint" as const,
            type: "scatter" as const,
            title: "关注圈圆心相对岛落在哪？",
            description: "原点=中途岛；点大≈圈半径 nm",
            series: zoneFootprintScatterSeries(pack, spec),
          },
          {
            id: "cmp-zone-radius" as const,
            type: "hbar" as const,
            title: "各关注圈半径差多少海里？",
            description: "条长=半径 nm；对照地图圈的大小与等级",
            series: zoneRadiusBarSeries(spec),
          },
        ]
      : []),
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

export type CompareChartOptions = {
  /**
   * true=有范式：从扩展池按 M→T + 本片适切度选图；
   * false=无范式：仅适切度入选（不读 M；不与 B 凑成固定对偶）。
   */
  rich?: boolean;
  /** 有切片兵力坐标时，可生成「敌我×登陆海域」空间散点 */
  pack?: SlicePack;
  /** 切片阶段文案，供节拍面积图推断当前拍 */
  packPhase?: string;
};

/** 本片序列是否像占位空图 */
function isPlaceholderSeries(series: ChartSpec["series"]): boolean {
  if (!series.length) return true;
  return series.every(
    (s) =>
      !s.name ||
      /（无|暂无|无高亮|无取样|无活动）/.test(s.name) ||
      (Number(s.value) === 0 && series.length <= 2),
  );
}

/**
 * 按本片序列估计扩展图适切度 0–100。
 * 玫瑰/距离阶梯在有方位·高亮可读时抬高；剖面/证据散点需更「有料」才过线。
 */
export function extensionDataFitness(chart: ChartSpec): number {
  const series = chart.series ?? [];
  if (isPlaceholderSeries(series)) return 0;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const id = chart.id ?? "";

  if (id === "cmp-force-landing") {
    const pts = series.filter(
      (s) => s.name && !/中途岛|登陆海域|（无/.test(s.name),
    );
    if (pts.length < 2) return 0;
    return clamp(48 + Math.min(pts.length, 16) * 3);
  }

  if (id === "cmp-threat-rank") {
    const rows = series.filter((s) => (Number(s.value) || 0) > 0);
    if (rows.length < 1) return 0;
    return clamp(46 + rows.length * 8);
  }

  if (id === "cmp-threat-level-bar") {
    const nz = series.filter((s) => (Number(s.value) || 0) > 0);
    if (nz.length < 1) return 0;
    return clamp(36 + nz.length * 12);
  }

  if (id === "cmp-force-bearing") {
    const us = series
      .filter((s) => s.side === "USN")
      .reduce((a, s) => a + (Number(s.value) || 0), 0);
    const ij = series
      .filter((s) => s.side === "IJN")
      .reduce((a, s) => a + (Number(s.value) || 0), 0);
    const total = us + ij;
    if (total < 3) return clamp(total * 10);
    const bySec = new Map<string, number>();
    for (const s of series) {
      bySec.set(s.name, (bySec.get(s.name) ?? 0) + (Number(s.value) || 0));
    }
    const peak = Math.max(...bySec.values(), 0);
    const peaked = peak / Math.max(total, 1);
    // 两边都有落点 + 主峰清晰 → 高分
    const both = us > 0 && ij > 0 ? 22 : 0;
    return clamp(38 + total * 2.2 + peaked * 28 + both);
  }

  if (
    id === "cmp-highlight-range" ||
    id === "cmp-hunt-range" ||
    id === "cmp-force-range"
  ) {
    const rows = series.filter((s) => (Number(s.value) || 0) > 0);
    if (rows.length < 1) return 0;
    if (rows.length === 1) return clamp(42);
    const vals = rows.map((s) => Number(s.value) || 0);
    const span = Math.max(...vals) - Math.min(...vals);
    return clamp(40 + rows.length * 8 + Math.min(span, 80) * 0.25);
  }

  if (id === "cmp-zone-footprint") {
    const pts = series.filter(
      (s) => s.name && !/（无|暂无|登陆）/.test(s.name) && s.x != null,
    );
    if (pts.length < 1) return 0;
    return clamp(36 + Math.min(pts.length, 6) * 10);
  }

  if (id === "cmp-intent-axes") {
    const rows = series.filter(
      (s) => s.name && !/（无/.test(s.name) && (Number(s.value) || 0) > 0,
    );
    if (rows.length < 1) return 0;
    return clamp(38 + rows.length * 12);
  }

  if (id === "cmp-zone-radius") {
    const rows = series.filter(
      (s) => s.name && !/（无/.test(s.name) && (Number(s.value) || 0) > 0,
    );
    if (rows.length < 1) return 0;
    const vals = rows.map((s) => Number(s.value) || 0);
    const span = Math.max(...vals) - Math.min(...vals);
    return clamp(36 + rows.length * 12 + Math.min(span, 40));
  }

  if (id === "cmp-alt-bands") {
    const nonzero = series.filter((s) => (Number(s.value) || 0) > 0);
    const bands = new Set(nonzero.map((s) => s.name)).size;
    const total = nonzero.reduce((a, s) => a + (Number(s.value) || 0), 0);
    if (total < 2) return clamp(total * 12);
    // 高度全挤在一带 → 适切偏低（T81 换弹窗常见）
    if (bands <= 1) return clamp(28 + total);
    return clamp(40 + bands * 12 + Math.min(total, 20));
  }

  if (id === "cmp-air-profile") {
    const pts = series.filter(
      (s) => s.name && !/（无|暂无）/.test(s.name) && (s.y ?? 0) > 0,
    );
    if (pts.length < 4) return clamp(pts.length * 8);
    // 有点云但默认不当主证据：满分压低，除非点很多且高度拉开
    const ys = pts.map((s) => Number(s.y) || 0);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    return clamp(22 + pts.length * 1.8 + Math.min(ySpan, 8) * 4);
  }

  if (id === "cmp-evidence-focus") {
    const pts = series.filter(
      (s) => s.name && !/（无|暂无）/.test(s.name),
    );
    if (pts.length < 2) return clamp(pts.length * 15);
    // 与常驻散点同构，适切中等封顶，避免无脑入选
    return clamp(30 + Math.min(pts.length, 8) * 5);
  }

  // 其它扩展：有有效点就给基础分
  const n = series.filter((s) => (Number(s.value) || 0) > 0 || s.x != null)
    .length;
  return clamp(n * 12);
}

function chartAsType(chart: ChartSpec, type: ChartType): ChartSpec {
  if (chart.type === type) return chart;
  if (chart.id === "cmp-hunt-range" && (type === "bar" || type === "hbar")) {
    return {
      ...chart,
      type,
      description:
        type === "hbar"
          ? "贴身/可及/疏远条数（横条）"
          : "贴身/可及/疏远条数（柱）",
    };
  }
  if (chart.id === "cmp-alt-bands" && type === "grouped_bar") {
    return {
      ...chart,
      type,
      description: "各高度带架次（美/日分组柱）",
    };
  }
  if (chart.id === "cmp-intent-axes" && type === "radar") {
    return {
      ...chart,
      type,
      description: "美/日作战指向落入十六方位；突起=指向所在扇区，半径=海里",
    };
  }
  if (chart.id === "cmp-threat-level-bar" && type === "pie") {
    return {
      ...chart,
      type,
      description: "紧急/高/中/低构成占比",
    };
  }
  if (chart.id === "cmp-force-bearing" && type === "bar") {
    return {
      ...chart,
      type,
      description: "美/日八方位计数（柱）",
    };
  }
  return { ...chart, type };
}

function applyVmmpChartSelection(
  charts: ChartSpec[],
  taskFocus: TaskFocus,
  rich: boolean,
): ChartSpec[] {
  const fitnessById = new Map<string, number>();
  for (const c of charts) {
    if (!c.id) continue;
    fitnessById.set(c.id, extensionDataFitness(c));
  }
  const { ids, whyById, typeByFamily } = selectChartSlotIds(taskFocus, rich, {
    fitnessById,
  });
  const byId = new Map(charts.filter((c) => c.id).map((c) => [c.id as string, c]));
  return [...ids]
    .map((id) => byId.get(id))
    .filter((c): c is ChartSpec => Boolean(c))
    .map((c) => {
      const type = typeByFamily.get(c.id!) ?? c.type;
      return {
        ...chartAsType(c, type),
        why_type: whyById.get(c.id!) || c.why_type,
      };
    });
}

/** 生成共用预选图槽候选；意图/威胁同一套，入选再按 A/B 规则筛 */
function buildTaskChartCandidates(
  spec: SituationViewSpec,
  _taskFocus: TaskFocus,
  options?: CompareChartOptions,
): ChartSpec[] {
  const pack = options?.pack;
  const spatialCharts = buildSpatialRelationCharts(pack, spec);
  const byId = (id: string) => spatialCharts.filter((c) => c.id === id);

  const ratings = (spec.threat_ratings ?? [])
    .filter((r) => perspectiveBucket(r.perspective ?? "") === "红方看蓝方")
    .flatMap((r) =>
      expandBundledShipTarget(r.target).map((target) => ({ ...r, target })),
    );

  return [
    ...byId("cmp-force-landing"),
    buildAxisVectorChart(spec),
    {
      id: "cmp-threat-rank",
      type: "hbar",
      title: "威胁目标排序",
      description: "条长=等级分（1–4）；悬停看证据",
      series: threatRankSeries(ratings),
    },
    ...byId("cmp-zone-footprint"),
    ...byId("cmp-zone-radius"),
    ...byId("cmp-force-range"),
    ...byId("cmp-force-bearing"),
    {
      id: "cmp-highlight-range" as const,
      type: "scatter" as const,
      title: "高亮实体相对岛的方位×距离？",
      description: "横轴方位°，纵轴距岛 nm",
      series: pack ? highlightRangeSeries(pack, spec) : [],
    },
    ...byId("cmp-alt-bands"),
    ...byId("cmp-air-profile"),
    ...byId("cmp-hunt-range"),
  ];
}

/** 本片各扩展槽适切度（供选图对照表） */
export function buildExtensionFitnessMap(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  options?: CompareChartOptions,
): Map<string, number> {
  const fitnessById = new Map<string, number>();
  for (const c of buildTaskChartCandidates(spec, taskFocus, options)) {
    if (!c.id) continue;
    fitnessById.set(c.id, extensionDataFitness(c));
  }
  return fitnessById;
}

/**
 * 单切片任务认知图槽：先生成候选图，再按 VMMP M/T（有范式）或基线（无范式）
 * + 本片适切度筛选；按任务优先级入选（至多 5 张），其余合格降为备选。
 */
export function buildAllTaskCompareCharts(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  packPhase?: string,
  options?: CompareChartOptions,
): ChartSpec[] {
  return buildTaskChartCandidates(spec, taskFocus, {
    ...options,
    packPhase: options?.packPhase ?? packPhase,
  });
}

export function buildTaskCompareCharts(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  packPhase?: string,
  options?: CompareChartOptions,
): ChartSpec[] {
  const rich = options?.rich !== false;
  const candidates = buildAllTaskCompareCharts(
    spec,
    taskFocus,
    packPhase,
    options,
  );
  return applyVmmpChartSelection(candidates, taskFocus, rich);
}

