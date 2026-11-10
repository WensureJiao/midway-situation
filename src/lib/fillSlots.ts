/**
 * 填槽 → 几何：模型只给单位/集群名，渲染器用 pack 坐标画轴和圈。
 * 不采用模型给的经纬度、半径、center/zoom、charts。
 */
import { centroid, findByNameHint, isAirborne } from "./summarize";
import {
  applyZoneOverrides,
  buildThreatZoneSkeleton,
  collectZoneOverrides,
  normalizeZoneLevel,
} from "./threatZones";
import type {
  CompactUnit,
  MapAxis,
  SideId,
  SituationViewSpec,
  SlicePack,
  ThreatZone,
} from "./types";

const ALIASES: { re: RegExp; hint: string }[] = [
  { re: /赤城|akagi/i, hint: "Akagi" },
  { re: /加贺|kaga/i, hint: "Kaga" },
  { re: /苍龙|soryu/i, hint: "Soryu" },
  { re: /飞龙|hiryu/i, hint: "Hiryu" },
  { re: /利根|tone/i, hint: "Tone" },
  { re: /筑摩|chikuma/i, hint: "Chikuma" },
  { re: /企业|enterprise/i, hint: "Enterprise" },
  { re: /大黄蜂|hornet/i, hint: "Hornet" },
  { re: /约克城|yorktown/i, hint: "Yorktown" },
  { re: /中途岛|midway/i, hint: "中途岛主跑道" },
];

export const SLOT_ALIAS_HINT =
  "集群别名：南云 / 南云航母、TF16、TF17、美特混、中途岛、在空接触带。from / to / around / highlight 只用单位名或这些别名，禁止经纬度。";

function allUnits(pack: SlicePack): CompactUnit[] {
  return [...(pack.sides.USN?.units ?? []), ...(pack.sides.IJN?.units ?? [])];
}

function carriersOf(pack: SlicePack, side: "USN" | "IJN"): CompactUnit[] {
  return (pack.sides[side]?.units ?? []).filter(
    (u) => u.unit_type === "Ship" && /航空母舰/.test(u.unit_class ?? ""),
  );
}

function sideOf(units: CompactUnit[]): SideId | undefined {
  const us = units.filter((u) => u.side === "USN").length;
  const ij = units.filter((u) => u.side === "IJN").length;
  if (us && !ij) return "USN";
  if (ij && !us) return "IJN";
  return undefined;
}

/** 把自由文本对到本片真实单位；对不上返回 undefined */
export function resolvePackUnit(
  pack: SlicePack,
  raw: string,
): CompactUnit | undefined {
  const q = raw.trim();
  if (!q) return undefined;
  const direct = findByNameHint(pack, q);
  if (direct) return direct;
  const alias = ALIASES.find((a) => a.re.test(q));
  if (alias) return findByNameHint(pack, alias.hint);
  if (/南云|nagumo/i.test(q)) return carriersOf(pack, "IJN")[0];
  if (/\bTF16\b|第16特混/i.test(q)) {
    return findByNameHint(pack, "Enterprise") ?? findByNameHint(pack, "Hornet");
  }
  if (/\bTF17\b|第17特混/i.test(q)) return findByNameHint(pack, "Yorktown");
  return undefined;
}

function expandHighlightToken(pack: SlicePack, raw: string): CompactUnit[] {
  const q = raw.trim();
  if (!q) return [];
  if (/^nagumo$/i.test(q) || (/南云|nagumo/i.test(q) && !/中途岛|midway/i.test(q))) {
    return carriersOf(pack, "IJN");
  }
  if (/^tf16$/i.test(q) || /\bTF16\b|第16特混|企业.*大黄蜂|大黄蜂.*企业/i.test(q)) {
    return [
      findByNameHint(pack, "Enterprise"),
      findByNameHint(pack, "Hornet"),
    ].filter((u): u is CompactUnit => Boolean(u));
  }
  if (/^tf17$/i.test(q) || (/\bTF17\b|第17特混/i.test(q) && !/16/.test(q))) {
    const y = findByNameHint(pack, "Yorktown");
    return y ? [y] : [];
  }
  if (/美特混|美航母|特混舰队/i.test(q)) {
    return carriersOf(pack, "USN");
  }
  if (/^air-contact$/i.test(q) || /在空|水侦|接触带/i.test(q)) {
    return allUnits(pack).filter(isAirborne);
  }
  if (/^midway$/i.test(q)) {
    const m = findByNameHint(pack, "中途岛主跑道");
    return m ? [m] : [];
  }
  const one = resolvePackUnit(pack, q);
  return one ? [one] : [];
}

function clusterRadiusNm(units: CompactUnit[]): number {
  const c = centroid(units);
  if (!c) return 14;
  if (units.length === 1) return 12;
  let max = 0;
  for (const u of units) {
    const dLat = (u.latitude - c[0]) * 60;
    const dLon =
      (u.longitude - c[1]) * 60 * Math.cos((c[0] * Math.PI) / 180);
    max = Math.max(max, Math.hypot(dLat, dLon));
  }
  const cap = units.every(isAirborne) ? 18 : 28;
  return Math.min(cap, Math.max(10, Math.round(max + 8)));
}

function asName(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function asCoord(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const lat = Number(v[0]);
  const lon = Number(v[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function nearestUnit(
  pack: SlicePack,
  lat: number,
  lon: number,
  maxDeg = 1.25,
): CompactUnit | undefined {
  let best: CompactUnit | undefined;
  let bestD = maxDeg;
  for (const u of allUnits(pack)) {
    const d = Math.hypot(u.latitude - lat, u.longitude - lon);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function parseAxisNames(label: string): [string, string] | null {
  const parts = label.split(/\s*[→\-–>➡]\s*/).map((s) => s.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

function resolveAnchor(
  pack: SlicePack,
  raw: string | null,
): { units: CompactUnit[]; point: [number, number] } | undefined {
  if (!raw) return undefined;
  const units = expandHighlightToken(pack, raw);
  if (!units.length) return undefined;
  const point = centroid(units);
  if (!point) return undefined;
  return { units, point };
}

function slugId(raw: string, prefix: string, i: number): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return `${prefix}-${s || i + 1}`;
}

export function listFillableNames(pack: SlicePack): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const u of allUnits(pack)) {
    if (u.unit_type !== "Ship" && u.unit_type !== "Facility") continue;
    if (seen.has(u.name)) continue;
    seen.add(u.name);
    names.push(u.name);
    if (names.length >= 28) break;
  }
  return names;
}

function sanitizeHighlights(
  pack: SlicePack,
  names: string[] | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    for (const u of expandHighlightToken(pack, String(raw ?? ""))) {
      if (seen.has(u.name)) continue;
      seen.add(u.name);
      out.push(u.name);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

type AxisIn = {
  id?: string;
  from?: unknown;
  to?: unknown;
  label?: string;
  side?: string;
};

function sanitizeAxes(pack: SlicePack, raw: unknown): MapAxis[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: MapAxis[] = [];
  for (const item of list) {
    if (out.length >= 4) break;
    const ax = (item ?? {}) as AxisIn;
    const named = parseAxisNames(String(ax.label ?? ""));
    const fromName = asName(ax.from) ?? named?.[0] ?? null;
    const toName = asName(ax.to) ?? named?.[1] ?? null;
    let fromA = resolveAnchor(pack, fromName);
    let toA = resolveAnchor(pack, toName);
    if (!fromA) {
      const c = asCoord(ax.from);
      const u = c ? nearestUnit(pack, c[0], c[1]) : undefined;
      fromA = u ? resolveAnchor(pack, u.name) : undefined;
    }
    if (!toA) {
      const c = asCoord(ax.to);
      const u = c ? nearestUnit(pack, c[0], c[1]) : undefined;
      toA = u
        ? resolveAnchor(pack, u.name)
        : resolveAnchor(pack, "中途岛");
    }
    if (!fromA || !toA) continue;
    if (fromA.point[0] === toA.point[0] && fromA.point[1] === toA.point[1]) {
      continue;
    }
    const side: SideId =
      ax.side === "IJN" || ax.side === "USN"
        ? ax.side
        : (sideOf(fromA.units) ?? "USN");
    const label =
      String(ax.label ?? "").trim().slice(0, 24) ||
      `${fromName || fromA.units[0]?.name}→${toName || toA.units[0]?.name}`;
    out.push({
      id: String(ax.id ?? slugId(label, "axis", out.length)).slice(0, 40),
      from: fromA.point,
      to: toA.point,
      label,
      side,
    });
  }
  return out;
}

type ZoneIn = {
  id?: string;
  around?: string;
  center?: unknown;
  radius_nm?: unknown;
  level?: string;
  label?: string;
  side?: string;
};

function sanitizeZones(pack: SlicePack, raw: unknown): ThreatZone[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ThreatZone[] = [];
  const seen = new Set<string>();
  let urgentLeft = 2;

  for (const item of list) {
    if (out.length >= 6) break;
    const z = (item ?? {}) as ZoneIn;
    const around =
      asName(z.around) ||
      asName(z.id) ||
      asName(z.label);
    let units = around ? expandHighlightToken(pack, around) : [];
    if (!units.length) {
      const c = asCoord(z.center);
      const u = c ? nearestUnit(pack, c[0], c[1]) : undefined;
      units = u ? [u] : [];
    }
    if (!units.length) continue;
    const center = centroid(units);
    if (!center) continue;

    let level = normalizeZoneLevel(String(z.level ?? ""));
    if (!level || level === "无/不适用") continue;
    if (level === "紧急") {
      if (urgentLeft <= 0) level = "高";
      else urgentLeft -= 1;
    }

    const id = String(z.id ?? slugId(around || units[0].name, "z", out.length))
      .trim()
      .slice(0, 40);
    if (seen.has(id)) continue;
    seen.add(id);

    const side =
      z.side === "USN" || z.side === "IJN" ? z.side : sideOf(units);
    out.push({
      id,
      center,
      radius_nm: clusterRadiusNm(units),
      level,
      label: String(z.label ?? around ?? id).trim().slice(0, 40) || id,
      side,
    });
  }
  return out;
}

function mapCenter(
  pack: SlicePack,
  highlights: string[],
  axes: MapAxis[],
): [number, number] {
  const hi = highlights
    .map((n) => findByNameHint(pack, n))
    .filter((u): u is CompactUnit => Boolean(u));
  const fromHi = centroid(hi);
  if (fromHi) return fromHi;
  const pts: CompactUnit[] = [];
  for (const ax of axes) {
    const a = nearestUnit(pack, ax.from[0], ax.from[1], 2);
    const b = nearestUnit(pack, ax.to[0], ax.to[1], 2);
    if (a) pts.push(a);
    if (b) pts.push(b);
  }
  const fromAx = centroid(pts);
  if (fromAx) return fromAx;
  const ships = allUnits(pack).filter((u) => u.unit_type === "Ship");
  return (
    centroid(ships) ||
    (findByNameHint(pack, "中途岛主跑道")
      ? [
          findByNameHint(pack, "中途岛主跑道")!.latitude,
          findByNameHint(pack, "中途岛主跑道")!.longitude,
        ]
      : ([28.21, -177.38] as [number, number]))
  );
}

/**
 * 用本片兵力把槽位落成地图几何；charts 清空（由渲染器另算）。
 */
export function fillRendererSlots(
  pack: SlicePack,
  spec: SituationViewSpec,
): SituationViewSpec {
  const map = spec.map ?? {
    center: [28.21, -177.38] as [number, number],
    zoom: 6,
    highlight_names: [],
    axes: [],
    threat_zones: [],
  };
  const slots = spec.slots;
  const highlights = sanitizeHighlights(
    pack,
    slots?.highlights ?? map.highlight_names,
  );
  const axes = sanitizeAxes(pack, slots?.axes ?? map.axes);
  let zones = sanitizeZones(pack, slots?.zones ?? map.threat_zones);
  if (!zones.length) {
    const skeleton = buildThreatZoneSkeleton(pack);
    zones = applyZoneOverrides(skeleton, collectZoneOverrides(spec), {
      pack,
      phaseLabel: spec.phase_label || pack.phase_label,
      ratings: spec.threat_ratings,
    });
  }
  return {
    ...spec,
    charts: [],
    intent_findings: [],
    threat_findings: [],
    priorities: [],
    map: {
      ...map,
      center: mapCenter(pack, highlights, axes),
      zoom: 6,
      highlight_names: highlights,
      axes,
      threat_zones: zones,
    },
  };
}
