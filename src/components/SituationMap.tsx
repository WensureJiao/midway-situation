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
import type { CompactUnit, SituationViewSpec, SlicePack } from "@/lib/types";
import { nmToMeters } from "@/lib/utils";
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
  tick,
}: {
  center?: [number, number] | null;
  tick?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!center || !tick) return;
    const [lat, lon] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.flyTo([lat, lon], Math.max(map.getZoom(), 7), { duration: 0.6 });
  }, [map, center, tick]);
  return null;
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
  opts: { damaged?: boolean; air?: boolean; facility?: boolean } = {},
): string {
  if (opts.facility) return "#c4a35a";
  if (opts.damaged) return "#d97706";
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

/** 俯视图符号 path（正北朝上，随后按航向旋转） */
function iconPath(kind: UnitIconKind): { d: string; size: number } {
  switch (kind) {
    case "carrier":
      return { size: 14, d: "M2 2 L12 2 L12 12 L2 12 Z" };
    case "battleship":
    case "cruiser":
    case "destroyer":
    case "ship":
      return { size: 11, d: "M5.5 1 A4.5 4.5 0 1 1 5.49 1 Z" };
    case "fighter":
    case "dive_bomber":
    case "torpedo":
    case "bomber":
    case "patrol":
    case "aircraft":
      return { size: 9, d: "M4.5 0.8 L8.2 8.4 L4.5 6.6 L0.8 8.4 Z" };
    case "airfield":
      return {
        size: 22,
        d: "M3 8.5 L19 8.5 L19 13.5 L3 13.5 Z M8.5 3 L13.5 3 L13.5 19 L8.5 19 Z",
      };
    case "aa":
      return {
        size: 16,
        d: "M8 1.5 L14 5 L14 12 L8 15.5 L2 12 L2 5 Z",
      };
    case "facility":
    default:
      return { size: 14, d: "M2 2 L12 2 L12 12 L2 12 Z" };
  }
}

function unitIcon(
  u: CompactUnit,
  opts: { highlight?: boolean } = {},
): L.DivIcon {
  const kind = classifyUnit(u);
  const isAir = u.unit_type === "Aircraft";
  const isFacility = u.unit_type === "Facility";
  const color = sideColor(String(u.side), {
    damaged: u.damaged,
    air: isAir,
    facility: isFacility,
  });
  const { d, size } = iconPath(kind);
  const pad = opts.highlight ? 4 : 2;
  const box = size + pad * 2;
  const heading = Number.isFinite(u.heading_deg) ? u.heading_deg : 0;
  const rotate = isAir ? heading : 0;
  const glow = opts.highlight
    ? `filter:drop-shadow(0 0 2px rgba(212,175,55,.95));`
    : "";
  const stroke = isAir
    ? ""
    : ` stroke="rgba(255,255,255,.9)" stroke-width="1.1" stroke-linejoin="round"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="display:block;overflow:visible"><g transform="translate(${pad},${pad}) rotate(${rotate} ${size / 2} ${size / 2})" style="${glow}"><path d="${d}" fill="${color}"${stroke}/></g></svg>`;
  return L.divIcon({
    className: "unit-icon",
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    html: svg,
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
  const { d, size } = iconPath(kind);
  const isAir =
    kind === "aircraft" ||
    kind === "fighter" ||
    kind === "dive_bomber" ||
    kind === "torpedo" ||
    kind === "bomber" ||
    kind === "patrol";
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${size} ${size}`}
      className="inline-block shrink-0"
      aria-hidden
    >
      <path
        d={d}
        fill={color}
        stroke={isAir ? "none" : "rgba(255,255,255,.85)"}
        strokeWidth={isAir ? 0 : 1.15}
        strokeLinejoin="round"
      />
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
function MapIconLegend() {
  const us = "#c45c4a";
  const ij = "#3b82a8";
  const usAir = "#e07a6a";
  const ijAir = "#6eb0d0";
  const fac = "#c4a35a";
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[min(100%-1.5rem,480px)] rounded-md bg-white/90 px-2.5 py-2 text-[10px] leading-none text-[var(--ink)] shadow-md ring-1 ring-black/12 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#c45c4a]" />
          美方
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3b82a8]" />
          日方
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="relative inline-flex h-3 w-7 items-center">
            <span className="inline-block h-0 w-full border-t-2 border-dashed border-[#dc2626]" />
            <svg
              className="absolute -right-0.5 -top-0.5"
              width="9"
              height="9"
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
        <span className="inline-flex items-center gap-1">
          <span className="relative inline-flex h-3 w-7 items-center">
            <span className="inline-block h-0 w-full border-t-2 border-dashed border-[#2563eb]" />
            <svg
              className="absolute -right-0.5 -top-0.5"
              width="9"
              height="9"
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
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-dashed border-[#b45309] bg-[#d4a017]/35" />
          关注区
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-dashed border-[#9f1239] bg-[#e11d48]/40" />
          紧急区
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-black/8 pt-1.5">
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="carrier" color={us} px={12} />
          航母
        </span>
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="ship" color={ij} px={11} />
          水面舰
        </span>
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="aircraft" color={usAir} px={9} />
          在空（美）
        </span>
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="aircraft" color={ijAir} px={9} />
          在空（日）
        </span>
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="airfield" color={fac} px={14} />
          机场
        </span>
        <span className="inline-flex items-center gap-1">
          <LegendGlyph kind="aa" color={fac} px={12} />
          防空
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex rounded-sm ring-2 ring-[#d4af37]/85">
            <LegendGlyph kind="carrier" color={us} px={11} />
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

  const highlight = useMemo(
    () => new Set(highlightNames),
    [highlightNames],
  );

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
      <MapIconLegend />

      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full rounded-lg"
        zoomControl
        attributionControl
      >
        <TileLayer
          key={basemap}
          url={tile.url}
          attribution={tile.attribution}
          maxZoom={tile.maxZoom}
        />
        <FitToSpec center={center} zoom={zoom} />
        <FocusCenterFly center={focusCenter} tick={focusTick} />

        {focusCenter && focusTick ? (
          <Marker
            key={`focus-pin-${focusTick}`}
            position={focusCenter}
            icon={focusPinIcon(focusLabel || "目标位置", focusColor)}
            interactive={false}
            zIndexOffset={900}
          />
        ) : null}

        {threatZones.map((z) => {
          // 等级着色 + 虚线圆，贴近参考界面的关注区样式
          const urgent = z.level === "紧急";
          return (
            <Circle
              key={z.id}
              center={z.center}
              radius={nmToMeters(z.radius_nm)}
              pathOptions={{
                color: urgent ? "#9f1239" : "#d97706",
                fillColor: urgent ? "#e11d48" : "#f59e0b",
                fillOpacity: urgent ? 0.12 : 0.08,
                weight: urgent ? 2.2 : 1.8,
                dashArray: "10 7",
                opacity: 0.95,
              }}
            >
              <Tooltip sticky>
                {z.label} · {urgent ? "紧急区" : "关注区"} · ~{z.radius_nm} nm
              </Tooltip>
            </Circle>
          );
        })}

        {axes.flatMap((a) => {
          const color = a.side === "IJN" ? "#2563eb" : "#dc2626";
          return [
            <Polyline
              key={a.id}
              positions={[a.from, a.to]}
              pathOptions={{
                color,
                weight: 3,
                dashArray: "9 7",
                opacity: 0.95,
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
          const icon = unitIcon(u, { highlight: hl });
          if (u.unit_type === "Aircraft") {
            return (
              <Marker
                key={`${u.side}-${u.name}-${u.latitude}`}
                position={[u.latitude, u.longitude]}
                icon={icon}
                opacity={0.95}
                zIndexOffset={200}
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
              zIndexOffset={hl || /航空母舰/.test(u.unit_class) ? 300 : 100}
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
              {hl && (
                <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                  {u.name}
                </Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
