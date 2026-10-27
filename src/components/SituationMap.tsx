"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { CompactUnit, SituationViewSpec, SlicePack, ThreatZone } from "@/lib/types";
import { zoneLevelLegend, zoneLevelVisual } from "@/lib/zoneLevel";
import { drawnRadiusNm, nmToMeters } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

type BasemapId = "satellite" | "ocean";

const BASEMAPS: Record<
  BasemapId,
  { label: string; url: string; attribution: string; maxZoom?: number }
> = {
  satellite: {
    label: "卫星影像",
    // Esri World Imagery — 太平洋开阔海区能看清中途岛环礁
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
    maxZoom: 19,
  },
  ocean: {
    label: "海图",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Ocean",
    maxZoom: 16,
  },
};

function FitToSpec({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    // 只做首次落图，避免与「在地图中定位」的 flyTo 互相抢视图
    if (fitted.current) return;
    fitted.current = true;
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

/** 飞到已解析好的坐标（由面板侧做威胁名→坐标映射） */
function FocusCenterFly({
  center,
  span,
  points,
  zone,
  tick,
}: {
  center?: [number, number] | null;
  /** 有起终点时按整段指向取景，而不是钉在一个点上 */
  span?: [[number, number], [number, number]] | null;
  /** 同一等级的多个目标一起取景 */
  points?: [number, number][];
  /** 活动区按整圈取景 */
  zone?: { center: [number, number]; radius_nm: number } | null;
  tick?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!tick) return;
    if (zone?.center && zone.radius_nm > 0) {
      const [lat, lon] = zone.center;
      const dLat = zone.radius_nm / 60;
      const cos = Math.cos((lat * Math.PI) / 180) || 1;
      const dLon = zone.radius_nm / (60 * cos);
      const bounds = L.latLngBounds(
        [lat - dLat, lon - dLon],
        [lat + dLat, lon + dLon],
      );
      if (!bounds.isValid()) return;
      map.flyToBounds(bounds, {
        padding: [48, 48],
        maxZoom: 9,
        duration: 0.6,
      });
      return;
    }
    if (span) {
      const bounds = L.latLngBounds(span[0], span[1]);
      if (!bounds.isValid()) return;
      // 指向定位：飞向中点并放大；勿用低 maxZoom 的 fitBounds（长轴会越点越小）
      const fitZoom = map.getBoundsZoom(bounds, false, L.point(48, 48));
      const zoom = Math.min(
        Math.max(
          Number.isFinite(fitZoom) ? fitZoom : 8,
          map.getZoom(),
          8,
        ),
        11,
      );
      map.flyTo(bounds.getCenter(), zoom, { duration: 0.65 });
      return;
    }
    if (points && points.length > 1) {
      const bounds = L.latLngBounds(points);
      if (!bounds.isValid()) return;
      map.flyToBounds(bounds, {
        padding: [72, 72],
        maxZoom: 12,
        duration: 0.6,
      });
      return;
    }
    const one = points?.[0] ?? center;
    if (!one) return;
    const [lat, lon] = one;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.flyTo([lat, lon], Math.max(map.getZoom(), 7), { duration: 0.6 });
  }, [map, center, span, points, zone, tick]);
  return null;
}

function axisFocusLabelIcon(label: string, color: string) {
  const safe = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const c = color.replace(/"/g, "");
  return L.divIcon({
    className: "axis-focus-label-icon",
    iconSize: [140, 18],
    iconAnchor: [70, 9],
    html: `<div class="unit-hl-label axis-focus-label" style="color:${c};border-color:${c}" title="${safe}">${safe}</div>`,
  });
}

function axisMidpoint(
  from: [number, number],
  to: [number, number],
): [number, number] {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}

function focusPinIcon(label: string, color = "#dc2626") {
  const safe = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const c = color.replace(/"/g, "");
  const html = `<div class="focus-pin" style="--focus-c:${c}"><div class="focus-pin-dot"></div><div class="focus-pin-label" title="${safe}">${safe}</div></div>`;
  return L.divIcon({
    className: "focus-pin-icon",
    iconSize: [168, 44],
    iconAnchor: [84, 10],
    html,
  });
}

type UnitIconKind =
  | "carrier"
  | "battleship"
  | "cruiser"
  | "destroyer"
  | "ship"
  | "fighter"
  | "dive_bomber"
  | "torpedo"
  | "bomber"
  | "patrol"
  | "aircraft"
  | "airfield"
  | "aa"
  | "facility";

function sideColor(
  side: string,
  opts: { air?: boolean; facility?: boolean } = {},
): string {
  if (opts.facility) return "#c4a35a";
  if (side === "IJN") return opts.air ? "#6eb0d0" : "#3b82a8";
  return opts.air ? "#e07a6a" : "#c45c4a";
}

function classifyUnit(u: CompactUnit): UnitIconKind {
  const cls = u.unit_class ?? "";
  if (u.unit_type === "Facility") {
    if (/机场|跑道/.test(cls)) return "airfield";
    if (/防空/.test(cls)) return "aa";
    return "facility";
  }
  if (u.unit_type === "Aircraft") return "aircraft";
  if (/航空母舰/.test(cls)) return "carrier";
  if (/战列/.test(cls)) return "battleship";
  if (/巡洋/.test(cls)) return "cruiser";
  if (/驱逐/.test(cls)) return "destroyer";
  return "ship";
}

type IconMark = {
  size: number;
  d: string;
  draw: "fill" | "stroke" | "plain";
  /** 非正方形 viewBox（侧面船形用宽幅） */
  vbW?: number;
  vbH?: number;
  /** 舰桥窗等白色细部 */
  detail?: string;
  /** 舰岛：与舰体同色系、更深一档 */
  accent?: string;
};

function markView(mark: IconMark) {
  return { w: mark.vbW ?? mark.size, h: mark.vbH ?? mark.size };
}

/** 态势符号：航母方形；水面舰顶视船体；飞机顶视；尖端/舰首朝航向。 */
function iconPath(kind: UnitIconKind): IconMark {
  switch (kind) {
    case "carrier":
      // 实心细长剪影：舰首朝上，右舷一体舰岛
      return {
        size: 26,
        draw: "fill",
        d: "M13 0.7 L16.8 5.4 L16.4 7 L20.5 7 L20.5 13.4 L16.3 13.4 L16.1 20.6 L14.6 25.2 L11.4 25.2 L9.9 20.6 L9.5 5.4 Z",
      };
    case "battleship":
      // 顶视船体：尖艏、两舷、舰桥翼、收艉（刻法对齐飞机）
      return {
        size: 18,
        draw: "plain",
        d: "M9 0.5 L11.4 3.6 L11.6 7.2 L14.2 8.4 L14.2 9.8 L11.6 9.4 L11.2 14.2 L9.8 17.4 L8.2 17.4 L6.8 14.2 L6.4 9.4 L3.8 9.8 L3.8 8.4 L6.4 7.2 L6.6 3.6 Z",
      };
    case "cruiser":
      return {
        size: 16,
        draw: "plain",
        d: "M8 0.5 L10.2 3.2 L10.4 6.4 L12.6 7.4 L12.6 8.6 L10.4 8.2 L10.1 12.6 L9 15.4 L7 15.4 L5.9 12.6 L5.6 8.2 L3.4 8.6 L3.4 7.4 L5.6 6.4 L5.8 3.2 Z",
      };
    case "destroyer":
    case "ship":
      // 图例「水面舰」
      return {
        size: 15,
        draw: "plain",
        d: "M7.5 0.4 L9.5 3 L9.7 6 L11.6 7 L11.6 8.1 L9.7 7.7 L9.4 11.8 L8.4 14.5 L6.6 14.5 L5.6 11.8 L5.3 7.7 L3.4 8.1 L3.4 7 L5.3 6 L5.5 3 Z",
      };
    case "fighter":
    case "dive_bomber":
    case "torpedo":
    case "bomber":
    case "patrol":
    case "aircraft":
      return {
        size: 16,
        draw: "plain",
        d: "M8 0.7 L9.2 5.5 L15.3 7.5 L15.3 9 L9.3 8.1 L8.8 12.2 L11.3 13.7 L11.3 15 L8 14.1 L4.7 15 L4.7 13.7 L7.2 12.2 L6.7 8.1 L0.7 9 L0.7 7.5 L6.8 5.5 Z",
      };
    case "airfield":
      return {
        size: 22,
        draw: "fill",
        d: "M3 8.5 L19 8.5 L19 13.5 L3 13.5 Z M8.5 3 L13.5 3 L13.5 19 L8.5 19 Z",
      };
    case "aa":
      return {
        size: 16,
        draw: "fill",
        d: "M8 1.5 L14 5 L14 12 L8 15.5 L2 12 L2 5 Z",
      };
    case "facility":
    default:
      return { size: 14, draw: "fill", d: "M2 2 L12 2 L12 12 L2 12 Z" };
  }
}

function tintColor(hex: string, whiteMix: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const mix = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * (1 - whiteMix) + 255 * whiteMix)))
      .toString(16)
      .padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

function glyphSvg(
  mark: IconMark,
  color: string,
  rotate: number,
  px: number,
): string {
  const { w, h } = markView(mark);
  const cx = w / 2;
  const cy = h / 2;
  const detail = mark.detail
    ? `<path d="${mark.detail}" fill="#fff" fill-opacity=".92"/>`
    : "";
  const island = tintColor(color, 0.42);
  const accent = mark.accent
    ? `<path d="${mark.accent}" fill="${island}" stroke="${island}" stroke-width="1.6" stroke-linejoin="round"/>`
    : "";
  const body =
    mark.draw === "stroke"
      ? `<path d="${mark.d}" fill="none" stroke="${color}" stroke-width="2.15" stroke-linecap="round"/>`
      : mark.draw === "plain"
        ? `<path d="${mark.d}" fill="${color}" stroke="#fff" stroke-width="0.55" stroke-linejoin="round"/>`
        : `<path d="${mark.d}" fill="${color}" stroke="#fff" stroke-width="0.75" stroke-linejoin="round"/>${detail}${accent}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible"><g transform="rotate(${rotate} ${cx} ${cy})">${body}</g></svg>`;
}

/** 高亮标签用短名，避免整屏刷满长舰名 */
function shortUnitLabel(name: string): string {
  const s = name
    .replace(/^IJN\s+/i, "")
    .replace(/^CVA-\d+\s+/i, "")
    .replace(/^USS\s+/i, "")
    .trim();
  return s.length > 14 ? `${s.slice(0, 12)}…` : s;
}

function unitIcon(
  u: CompactUnit,
  opts: { highlight?: boolean; entityTag?: boolean } = {},
): L.DivIcon {
  const kind = classifyUnit(u);
  const isAir = u.unit_type === "Aircraft";
  const isFacility = u.unit_type === "Facility";
  const color = sideColor(String(u.side), {
    air: isAir,
    facility: isFacility,
  });
  const mark = iconPath(kind);
  const heading = Number.isFinite(u.heading_deg) ? u.heading_deg : 0;
  const rotate = isFacility ? 0 : heading;

  if (opts.entityTag) {
    const label = shortUnitLabel(u.name).replace(/[<>&"]/g, "");
    const html = `<div class="entity-tag">${glyphSvg(mark, color, rotate, 16)}<div class="entity-tag-label">${label}</div></div>`;
    return L.divIcon({
      className: "unit-icon",
      iconSize: [72, 34],
      iconAnchor: [36, 10],
      html,
    });
  }

  if (!opts.highlight) {
    const { w, h } = markView(mark);
    const box = Math.max(w, h) + 2;
    return L.divIcon({
      className: "unit-icon",
      iconSize: [box, box],
      iconAnchor: [box / 2, box / 2],
      html: glyphSvg(mark, color, rotate, box),
    });
  }

  const { w: mw, h: mh } = markView(mark);
  const glyphPx = Math.max(Math.max(mw, mh) + 6, 18);
  const ring = 40;
  const label = shortUnitLabel(u.name).replace(/[<>&"]/g, "");
  const html = `<div class="unit-hl" style="width:${ring}px;height:${ring + 18}px">
    <div class="unit-hl-ring" style="width:${ring}px;height:${ring}px">
      <span class="unit-hl-pulse"></span>
      <span class="unit-hl-pulse unit-hl-pulse--delay"></span>
      <div style="position:relative;z-index:2;filter:drop-shadow(0 0 2px #000)">${glyphSvg(mark, color, rotate, glyphPx)}</div>
    </div>
    <div class="unit-hl-label">${label}</div>
  </div>`;
  return L.divIcon({
    className: "unit-icon unit-icon--hl",
    iconSize: [ring, ring + 18],
    iconAnchor: [ring / 2, ring / 2],
    html,
  });
}

function LegendGlyph({
  kind,
  color,
  px = 12,
}: {
  kind: UnitIconKind;
  color: string;
  px?: number;
}) {
  const mark = iconPath(kind);
  const { w, h } = markView(mark);
  const wide = w > h;
  const dispW = wide ? Math.round(px * (w / h)) : px;
  const dispH = px;
  return (
    <svg
      width={dispW}
      height={dispH}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block shrink-0 overflow-visible"
      aria-hidden
    >
      {mark.draw === "stroke" ? (
        <path
          d={mark.d}
          fill="none"
          stroke={color}
          strokeWidth={2.15}
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d={mark.d}
            fill={color}
            stroke={mark.draw === "plain" ? "#fff" : "rgba(255,255,255,.9)"}
            strokeWidth={mark.draw === "plain" ? 0.55 : 0.75}
            strokeLinejoin="round"
          />
          {mark.detail ? (
            <path d={mark.detail} fill="#fff" fillOpacity={0.92} />
          ) : null}
          {mark.accent ? (
            <path
              d={mark.accent}
              fill={tintColor(color, 0.42)}
              stroke={tintColor(color, 0.42)}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          ) : null}
        </>
      )}
    </svg>
  );
}

/** 地理方位角（度，正北为 0，顺时针） */
function bearingDeg(from: [number, number], to: [number, number]): number {
  const φ1 = (from[0] * Math.PI) / 180;
  const φ2 = (to[0] * Math.PI) / 180;
  const Δλ = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** 实心三角箭头（尖端对准终点），与单位徽章区分开 */
function axisArrowIcon(side: string, bearing: number) {
  const color = side === "IJN" ? "#2563eb" : "#dc2626";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" style="display:block;overflow:visible;transform:rotate(${bearing}deg);transform-origin:9px 4px"><path d="M9 1.5 L15.5 14.5 L9 11.2 L2.5 14.5 Z" fill="${color}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`;
  return L.divIcon({
    className: "axis-arrow-icon",
    iconSize: [18, 18],
    iconAnchor: [9, 4],
    html: svg,
  });
}

/** 地图左下角图标图例；单位点用原样式，箭头用当前实心三角 */
function MapIconLegend({ showEntityTag = false }: { showEntityTag?: boolean }) {
  const us = "#c45c4a";
  const ij = "#3b82a8";
  const usAir = "#e07a6a";
  const ijAir = "#6eb0d0";
  const fac = "#c4a35a";
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] max-w-[min(100%-1rem,340px)] rounded bg-white/88 px-1.5 py-1 text-[9px] leading-none text-[var(--ink)] shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-0.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#c45c4a]" />
          美方
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#3b82a8]" />
          日方
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="relative inline-flex h-2.5 w-5 items-center">
            <span className="inline-block h-0 w-full border-t border-dashed border-[#dc2626]" />
            <svg
              className="absolute -right-0.5 -top-px"
              width="7"
              height="7"
              viewBox="0 0 18 18"
              aria-hidden
            >
              <path
                d="M9 1.5 L15.5 14.5 L9 11.2 L2.5 14.5 Z"
                fill="#dc2626"
              />
            </svg>
          </span>
          美方指向
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="relative inline-flex h-2.5 w-5 items-center">
            <span className="inline-block h-0 w-full border-t border-dashed border-[#2563eb]" />
            <svg
              className="absolute -right-0.5 -top-px"
              width="7"
              height="7"
              viewBox="0 0 18 18"
              aria-hidden
            >
              <path
                d="M9 1.5 L15.5 14.5 L9 11.2 L2.5 14.5 Z"
                fill="#2563eb"
              />
            </svg>
          </span>
          日方指向
        </span>
        {zoneLevelLegend().map((z) => (
          <span key={z.key} className="inline-flex items-center gap-0.5">
            <span
              className="inline-block h-2 w-2 rounded-full border"
              style={{
                borderColor: z.color,
                borderStyle: z.legendBorderStyle,
                background: `${z.fill}66`,
              }}
            />
            {z.label}
          </span>
        ))}
        {showEntityTag ? (
          <span className="inline-flex items-center gap-0.5">
            <span className="rounded bg-[#0f172a] px-0.5 py-px text-[8px] font-semibold text-[#e2e8f0] ring-1 ring-[#94a3b8]">
              实体
            </span>
            关键实体
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-black/8 pt-1">
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="carrier" color={us} px={14} />
          航母
        </span>
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="ship" color={ij} px={12} />
          水面舰
        </span>
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="aircraft" color={usAir} px={11} />
          飞机（美）
        </span>
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="aircraft" color={ijAir} px={11} />
          飞机（日）
        </span>
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="airfield" color={fac} px={11} />
          机场
        </span>
        <span className="inline-flex items-center gap-0.5">
          <LegendGlyph kind="aa" color={fac} px={10} />
          防空
        </span>
        <span className="inline-flex items-center gap-0.5">
          <span className="relative inline-flex h-[14px] w-[14px] items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[rgba(245,215,110,.35)] ring-2 ring-[#f5d76e]" />
            <LegendGlyph kind="carrier" color={us} px={8} />
          </span>
          高亮
        </span>
      </div>
    </div>
  );
}

export function SituationMap({
  pack,
  spec,
  focusCenter,
  focusLabel,
  focusColor = "#dc2626",
  focusTick,
  focusAxis,
  focusZone,
  focusPoints,
  markEntities = false,
}: {
  pack: SlicePack;
  spec: SituationViewSpec;
  /** 已解析的飞向坐标 [lat, lon] */
  focusCenter?: [number, number] | null;
  /** 定位目标名称（地图上显示标签） */
  focusLabel?: string;
  /** 定位高亮色（按威胁等级 / 核心对象区分） */
  focusColor?: string;
  /** 递增以重复触发定位 */
  focusTick?: number;
  /** 意图「定位这条指向」：高亮整段轴线，而不是终点一个钉 */
  focusAxis?: {
    id?: string;
    from: [number, number];
    to: [number, number];
    label?: string;
    side?: string;
  } | null;
  /** 点活动区时高亮整圈 */
  focusZone?: ThreatZone | null;
  /** 同一最高等级的多个威胁点，一起打标 */
  focusPoints?: { at: [number, number]; label: string; unitName?: string }[];
  /** 意图页：高亮单位改成「实体」名牌，避免看成威胁金环 */
  markEntities?: boolean;
}) {
  const [basemap, setBasemap] = useState<BasemapId>("satellite");
  const tile = BASEMAPS[basemap];

  const mapSpec = spec.map ?? {
    center: [28.21, -177.38] as [number, number],
    zoom: 6,
    highlight_names: [],
    axes: [],
    threat_zones: [],
  };
  const highlightNames = mapSpec.highlight_names ?? [];
  const threatZones = mapSpec.threat_zones ?? [];
  const axes = mapSpec.axes ?? [];
  const center = mapSpec.center ?? ([28.21, -177.38] as [number, number]);
  const zoom = mapSpec.zoom ?? 6;

  const highlight = useMemo(() => {
    const names = new Set(highlightNames);
    for (const p of focusPoints ?? []) {
      if (p.unitName) names.add(p.unitName);
    }
    return names;
  }, [highlightNames, focusPoints]);

  const units = useMemo(() => {
    const all: CompactUnit[] = [
      ...(pack.sides.USN?.units ?? []),
      ...(pack.sides.IJN?.units ?? []),
    ];
    return all.filter((u) => {
      if (u.unit_type === "Ship" || u.unit_type === "Facility") return true;
      if (u.unit_type === "Aircraft" && u.status === "空中") return true;
      return false;
    });
  }, [pack]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-md text-[11px] shadow ring-1 ring-black/20">
        {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`px-2.5 py-1.5 backdrop-blur ${
              basemap === id
                ? "bg-white/95 font-semibold text-[var(--ink)]"
                : "bg-white/70 text-[var(--muted)] hover:bg-white/85"
            }`}
            onClick={() => setBasemap(id)}
          >
            {BASEMAPS[id].label}
          </button>
        ))}
      </div>
      <MapIconLegend showEntityTag={markEntities} />

      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full rounded-lg"
        zoomControl
        attributionControl={false}
      >
        <TileLayer
          key={basemap}
          url={tile.url}
          attribution=""
          maxZoom={tile.maxZoom}
        />
        <FitToSpec center={center} zoom={zoom} />
        <FocusCenterFly
          center={focusCenter}
          span={
            focusAxis
              ? [focusAxis.from, focusAxis.to]
              : null
          }
          points={
            focusPoints && focusPoints.length > 1
              ? focusPoints.map((p) => p.at)
              : undefined
          }
          zone={
            focusZone
              ? {
                  center: focusZone.center,
                  radius_nm: drawnRadiusNm(focusZone.radius_nm),
                }
              : null
          }
          tick={focusTick}
        />

        {focusAxis && focusTick ? (
          <>
            <Polyline
              key={`focus-axis-hl-${focusTick}`}
              positions={[focusAxis.from, focusAxis.to]}
              pathOptions={{
                className: "axis-focus-line",
                color: focusColor,
                weight: 7,
                opacity: 0.95,
                lineCap: "round",
              }}
              interactive={false}
            />
            <Marker
              key={`focus-axis-label-${focusTick}`}
              position={axisMidpoint(focusAxis.from, focusAxis.to)}
              icon={axisFocusLabelIcon(
                focusAxis.label || focusLabel || "作战指向",
                focusColor,
              )}
              interactive={false}
              zIndexOffset={950}
            />
          </>
        ) : null}

        {focusPoints && focusPoints.length > 1 && focusTick && !focusAxis
          ? focusPoints.map((p) => (
              <Marker
                key={`focus-pin-${focusTick}-${p.label}`}
                position={p.at}
                icon={focusPinIcon(p.label, focusColor)}
                interactive={false}
                zIndexOffset={900}
              />
            ))
          : null}

        {focusCenter && focusTick && !focusAxis && !(focusPoints && focusPoints.length > 1) ? (
          <Marker
            key={`focus-pin-${focusTick}`}
            position={focusCenter}
            icon={focusPinIcon(focusLabel || "目标位置", focusColor)}
            interactive={false}
            zIndexOffset={900}
          />
        ) : null}

        {threatZones.map((z) => {
          const tone = zoneLevelVisual(String(z.level ?? ""));
          const picked =
            !!focusZone &&
            (focusZone.id ? focusZone.id === z.id : focusZone.label === z.label);
          return (
            <Circle
              key={`${z.id}-${picked ? "focus" : "idle"}`}
              center={z.center}
              radius={nmToMeters(drawnRadiusNm(z.radius_nm))}
              pathOptions={{
                className: picked ? "zone-focus-line" : undefined,
                color: picked ? focusColor || tone.color : tone.color,
                fillColor: tone.fill,
                fillOpacity: picked
                  ? 0.22
                  : focusZone
                    ? tone.fillOpacity * 0.35
                    : tone.fillOpacity,
                weight: picked ? 5 : tone.weight,
                dashArray: picked ? undefined : tone.dashArray,
                opacity: focusZone && !picked ? 0.3 : 0.95,
              }}
            >
              <Tooltip sticky>
                {z.label} · {tone.label} · ~{drawnRadiusNm(z.radius_nm)} nm
              </Tooltip>
            </Circle>
          );
        })}

        {axes.flatMap((a) => {
          const picked =
            focusAxis &&
            (focusAxis.id
              ? focusAxis.id === a.id
              : focusAxis.label === a.label);
          const color = a.side === "IJN" ? "#2563eb" : "#dc2626";
          return [
            <Polyline
              key={a.id}
              positions={[a.from, a.to]}
              pathOptions={{
                color,
                weight: 3,
                dashArray: "9 7",
                opacity: focusAxis && !picked ? 0.35 : 0.95,
                lineCap: "round",
              }}
            >
              <Tooltip sticky>{a.label} · 作战指向</Tooltip>
            </Polyline>,
            <Marker
              key={`${a.id}-arrow`}
              position={a.to}
              icon={axisArrowIcon(String(a.side), bearingDeg(a.from, a.to))}
              interactive={false}
              zIndexOffset={400}
            />,
          ];
        })}

        {units.map((u) => {
          const hl = highlight.has(u.name);
          const icon = unitIcon(u, {
            highlight: hl && !markEntities,
            entityTag: hl && markEntities,
          });
          const z = hl
            ? 800
            : u.unit_type === "Aircraft"
              ? 200
              : /航空母舰/.test(u.unit_class)
                ? 300
                : 100;
          if (u.unit_type === "Aircraft") {
            return (
              <Marker
                key={`${u.side}-${u.name}-${u.latitude}`}
                position={[u.latitude, u.longitude]}
                icon={icon}
                opacity={0.95}
                zIndexOffset={z}
              >
                <Popup>
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold">{u.name}</div>
                    <div>
                      {u.unit_class} · {u.altitude_m} m · {u.heading_deg}°
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          }
          if (u.unit_type === "Facility") {
            return (
              <Marker
                key={`${u.side}-${u.name}`}
                position={[u.latitude, u.longitude]}
                icon={icon}
                zIndexOffset={z}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">{u.name}</div>
                    <div>{u.unit_class}</div>
                  </div>
                </Popup>
              </Marker>
            );
          }
          return (
            <Marker
              key={`${u.side}-${u.name}`}
              position={[u.latitude, u.longitude]}
              icon={icon}
              zIndexOffset={z}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold">{u.name}</div>
                  <div>
                    {u.unit_class} · {u.status}
                  </div>
                  <div>
                    {u.speed_kn} kn / {u.heading_deg}°
                    {u.damaged ? " · 损伤" : ""}
                  </div>
                  {u.embarked_aircraft_count != null && (
                    <div>舰载机 {u.embarked_aircraft_count}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
