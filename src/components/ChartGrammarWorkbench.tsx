"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SituationCharts } from "@/components/SituationCharts";
import { CHART_TYPE_CATALOG } from "@/lib/chartTypes";
import {
  buildChartGrammarFromReal,
  type AbSide,
  type SliceGrammarInput,
} from "@/lib/chartGrammar";
import type {
  SituationViewSpec,
  SliceIndexItem,
  SlicePack,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";

type ViewMode = "slice" | "timeline";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function loadSpec(id: string, focus: "threat" | "intent", side: AbSide) {
  return fetchJson<SituationViewSpec>(
    `/data/vmmp_ab_visual/${id}-${focus}-${side}.json`,
  ).then(normalizeSituationSpec);
}

async function loadSliceBundle(
  id: string,
  packPath: string,
): Promise<SliceGrammarInput> {
  const [pack, threatA, threatB, intentA, intentB] = await Promise.all([
    fetchJson<SlicePack>(packPath),
    loadSpec(id, "threat", "A"),
    loadSpec(id, "threat", "B"),
    loadSpec(id, "intent", "A"),
    loadSpec(id, "intent", "B"),
  ]);
  return { id, pack, threatA, threatB, intentA, intentB };
}

function tabClass(active: boolean) {
  return `rounded-md px-2.5 py-1.5 text-xs ring-1 transition ${
    active
      ? "bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent)]"
      : "bg-[var(--panel-2)] text-[var(--ink)] ring-[var(--line)] hover:bg-[var(--panel-3)]"
  }`;
}

export function ChartGrammarWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T81");
  const [viewMode, setViewMode] = useState<ViewMode>("slice");
  const [abSide, setAbSide] = useState<AbSide>("B");
  const [timeline, setTimeline] = useState<SliceGrammarInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<SliceIndexItem[]>("/data/midway/index.json")
      .then(async (items) => {
        const sorted = [...items].sort((a, b) => a.order - b.order);
        if (!cancelled) setIndex(sorted);
        const bundles = await Promise.all(
          sorted.map((item) => loadSliceBundle(item.id, item.path)),
        );
        if (!cancelled) {
          setTimeline(bundles);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(
    () => timeline.find((t) => t.id === sliceId) ?? timeline[0] ?? null,
    [timeline, sliceId],
  );

  const charts = useMemo(() => {
    if (!current || !timeline.length) {
      return { sliceCharts: [], timelineCharts: [] };
    }
    return buildChartGrammarFromReal(current, timeline, abSide);
  }, [current, timeline, abSide]);

  const meta = index.find((i) => i.id === (current?.id ?? sliceId));

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md bg-[var(--panel-2)] px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--panel-3)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回主台
        </Link>
        <Link
          href="/compare"
          className="rounded-md bg-[var(--panel-2)] px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--panel-3)]"
        >
          VMMP 对比
        </Link>
        <h1 className="text-base font-semibold text-[var(--ink)]">
          统计图语法（{CHART_TYPE_CATALOG.length} 类）
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {index.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSliceId(s.id);
                setViewMode("slice");
              }}
              className={tabClass(viewMode === "slice" && sliceId === s.id)}
            >
              <span className="font-semibold">{s.id}</span>{" "}
              <span className="opacity-80">{s.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className={tabClass(viewMode === "timeline")}
          >
            <span className="font-semibold">时间线</span>{" "}
            <span className="opacity-80">T1→T193</span>
          </button>
        </div>
        <div className="ml-auto flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
          <button
            type="button"
            className={`px-3 py-1.5 ${abSide === "A" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
            onClick={() => setAbSide("A")}
          >
            A · 无范式
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 ${abSide === "B" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
            onClick={() => setAbSide("B")}
          >
            B · 有 VMMP
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-[#f8efe4] px-3 py-2 text-xs text-[#7a4b12] ring-1 ring-[#e0c4a0]">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
        <h2 className="mb-2 text-xs font-semibold text-[var(--ink)]">
          白名单（{CHART_TYPE_CATALOG.length}）
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CHART_TYPE_CATALOG.map((c, i) => (
            <li
              key={c.type}
              className="rounded-md bg-[var(--panel-2)] px-2 py-1.5 text-[11px]"
            >
              <div className="font-medium text-[var(--ink)]">
                {i + 1}. {c.label}
              </div>
              <div className="text-[var(--muted)]">{c.use}</div>
            </li>
          ))}
        </ul>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : viewMode === "timeline" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            跨切片时间线 · T1→T193
            {" · "}
            {abSide === "A" ? "A·无范式" : "B·有VMMP"}
          </h2>
          <SituationCharts
            charts={charts.timelineCharts}
            showFixedCharts
            showFocusPanels={false}
          />
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            {meta && current ? `${current.id} ${meta.label}` : sliceId}
            {" · "}
            {abSide === "A" ? "A·无范式" : "B·有VMMP"}
          </h2>
          <SituationCharts
            charts={charts.sliceCharts}
            showFixedCharts
            showFocusPanels={false}
          />
        </section>
      )}
    </div>
  );
}
