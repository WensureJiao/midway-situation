"use client";

import { useEffect, useMemo, useState } from "react";
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

type BasemapId = "satellite" | "ocean" | "voyager";

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
  voyager: {
    label: "浅色底图",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO / OSM",
    maxZoom: 20,
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
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

function sideColor(side: string, damaged?: boolean): string {
  if (damaged) return "#d97706";
  if (side === "IJN") return "#3b82a8";
  return "#c45c4a";
}

function airIcon(side: string) {
  const color = side === "IJN" ? "#6eb0d0" : "#e07a6a";
  return L.divIcon({
    className: "",
    iconSize: [8, 8],
    iconAnchor: [4, 4],
    html: `<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid ${color};filter:drop-shadow(0 0 1px #000)"></div>`,
  });
}

function shipIcon(side: string, damaged?: boolean, highlight?: boolean) {
  const color = sideColor(side, damaged);
  const size = highlight ? 14 : 10;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:2px;background:${color};border:1px solid rgba(255,255,255,.85);box-shadow:0 0 0 ${highlight ? 3 : 0}px rgba(212,175,55,.45);transform:rotate(45deg)"></div>`,
  });
}

function facilityIcon() {
  return L.divIcon({
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<div style="width:12px;height:12px;border-radius:999px;background:#c4a35a;border:2px solid #fff"></div>`,
  });
}

export function SituationMap({
  pack,
  spec,
}: {
  pack: SlicePack;
  spec: SituationViewSpec;
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

      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full rounded-lg"
        zoomControl
        attributionControl
      >
        {basemap === "voyager" ? (
          <TileLayer
            key={basemap}
            url={tile.url}
            attribution={tile.attribution}
            maxZoom={tile.maxZoom}
            subdomains="abcd"
          />
        ) : (
          <TileLayer
            key={basemap}
            url={tile.url}
            attribution={tile.attribution}
            maxZoom={tile.maxZoom}
          />
        )}
        <FitToSpec center={center} zoom={zoom} />

        {threatZones.map((z) => (
          <Circle
            key={z.id}
            center={z.center}
            radius={nmToMeters(z.radius_nm)}
            pathOptions={{
              color:
                z.level === "紧急"
                  ? "#b45309"
                  : z.side === "IJN"
                    ? "#3b82a8"
                    : "#c45c4a",
              fillColor:
                z.level === "紧急"
                  ? "#f59e0b"
                  : z.side === "IJN"
                    ? "#3b82a8"
                    : "#c45c4a",
              fillOpacity: 0.12,
              weight: 1.5,
              dashArray: z.level === "紧急" ? undefined : "4 6",
            }}
          >
            <Tooltip sticky>
              {z.label} · {z.level} · ~{z.radius_nm} nm
            </Tooltip>
          </Circle>
        ))}

        {axes.map((a) => (
          <Polyline
            key={a.id}
            positions={[a.from, a.to]}
            pathOptions={{
              color: a.side === "IJN" ? "#3b82a8" : "#c45c4a",
              weight: 2,
              dashArray: "8 6",
              opacity: 0.85,
            }}
          >
            <Tooltip sticky>{a.label}</Tooltip>
          </Polyline>
        ))}

        {units.map((u) => {
          const hl = highlight.has(u.name);
          if (u.unit_type === "Aircraft") {
            return (
              <Marker
                key={`${u.side}-${u.name}-${u.latitude}`}
                position={[u.latitude, u.longitude]}
                icon={airIcon(String(u.side))}
                opacity={0.9}
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
                icon={facilityIcon()}
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
              icon={shipIcon(String(u.side), u.damaged, hl)}
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
