"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SituationCharts } from "@/components/SituationCharts";
import { MapAnnotationLegend } from "@/components/MapAnnotationLegend";
import type {
  GenerateResponse,
  SituationViewSpec,
  SliceIndexItem,
  SlicePack,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";
import { SITUATION_SYSTEM_PROMPT } from "@/lib/prompts";
import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Map as MapIcon,
  Sparkles,
  Terminal,
} from "lucide-react";

const SituationMap = dynamic(
  () => import("@/components/SituationMap").then((m) => m.SituationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
        地图加载中…
      </div>
    ),
  },
);

type Mode = "local" | "llm";

function toneClass(tone: string) {
  if (tone === "usn") return "kpi-usn";
  if (tone === "ijn") return "kpi-ijn";
  if (tone === "warn") return "kpi-warn";
  return "kpi-neutral";
}

export function SituationWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T1");
  const [pack, setPack] = useState<SlicePack | null>(null);
  const [mode, setMode] = useState<Mode>("local");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<SituationViewSpec | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/midway/index.json")
      .then((r) => r.json())
      .then((data: SliceIndexItem[]) => {
        setIndex([...data].sort((a, b) => a.order - b.order));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const item = index.find((i) => i.id === sliceId);
    if (!item) return;
    setPack(null);
    setSpec(null);
    fetch(item.path)
      .then((r) => r.json())
      .then((data: SlicePack) => setPack(data))
      .catch((e) => setError(String(e)));
  }, [sliceId, index]);

  const generate = useCallback(async () => {
    if (!pack) return;
    setLoading(true);
    setError(null);
    setFallbackNote(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          time_slice: sliceId,
          mode,
        }),
      });
      const data = (await res.json()) as GenerateResponse & {
        spec: SituationViewSpec | null;
      };
      if (!res.ok || !data.ok || !data.spec) {
        throw new Error(data.error || "生成失败");
      }
      setSpec(normalizeSituationSpec(data.spec));
      if (data.used_fallback) {
        setFallbackNote(data.error || "已回退本地生成器");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pack, sliceId, mode]);

  useEffect(() => {
    if (pack && !spec && !loading) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-2 flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-[var(--accent)]" />
            <div className="font-display text-lg leading-none tracking-wide">
              中途岛态势生成台
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {index.map((s) => (
              <button
                key={s.id}
                onClick={() => setSliceId(s.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs ring-1 transition ${
                  sliceId === s.id
                    ? "bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent)]"
                    : "bg-[var(--panel-2)] text-[var(--ink)] ring-[var(--line)] hover:bg-[var(--panel-3)]"
                }`}
              >
                <span className="font-semibold">{s.id}</span>{" "}
                <span className="opacity-80">{s.label}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/compare"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--panel-2)] px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--panel-3)]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              VMMP 视觉对比
            </Link>
            <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
              <button
                className={`px-2.5 py-1.5 ${mode === "local" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
                onClick={() => setMode("local")}
              >
                本地生成
              </button>
              <button
                className={`px-2.5 py-1.5 ${mode === "llm" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
                onClick={() => setMode("llm")}
              >
                LLM
              </button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSystemPrompt((v) => !v)}
            >
              <Terminal className="h-3.5 w-3.5" />
              System 提示词
            </Button>
            <Button
              size="sm"
              onClick={() => void generate()}
              disabled={loading || !pack}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              生成态势
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <div className="rounded-lg bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)] ring-1 ring-[var(--line)]">
          当前阶段：{pack?.phase_label ?? "加载中…"} · 输入为清洗兵力数据 +
          提示词，输出为态势地图、四张兵力统计图与威胁等级图
        </div>

        {(error || fallbackNote) && (
          <section className="flex gap-2 rounded-lg bg-[#f8efe4] p-3 text-xs text-[#7a4b12] ring-1 ring-[#e0c4a0]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>{error || fallbackNote}</div>
          </section>
        )}

        {showSystemPrompt && (
          <div className="animate-in rounded-lg bg-[#1a2330] p-3 text-[#d7e0ea] ring-1 ring-[#2a384a]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">系统提示词</h2>
              <button
                type="button"
                className="text-[10px] text-[#9eb0c4] hover:text-[#d7e0ea]"
                onClick={() => setShowSystemPrompt(false)}
              >
                关闭
              </button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed opacity-90">
              {SITUATION_SYSTEM_PROMPT}
            </pre>
          </div>
        )}

        {!spec || !pack ? (
          <div className="flex h-[70vh] items-center justify-center rounded-lg bg-[var(--panel)] text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
            {loading ? "正在根据清洗数据与提示词生成态势界面…" : "等待数据…"}
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h1 className="font-display text-2xl tracking-wide">
                    {spec.title}
                  </h1>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {spec.phase_label}
                    <span className="mx-2">·</span>
                    生成方式{" "}
                    {spec.generated_by === "llm" ? "LLM" : "本地确定性"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {spec.kpis.map((k) => (
                    <div
                      key={k.id}
                      className={`min-w-[72px] rounded-md px-2.5 py-1.5 ${toneClass(k.tone)}`}
                    >
                      <div className="text-[10px] opacity-80">{k.label}</div>
                      <div className="text-lg font-semibold leading-tight">
                        {k.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-[var(--ink)]/90">
                {spec.narrative}
              </p>
              <div className="map-shell h-[min(58vh,560px)] overflow-hidden rounded-lg ring-1 ring-[var(--line)]">
                <SituationMap pack={pack} spec={spec} />
              </div>
              {(spec.map.axes?.length ?? 0) > 0 ||
              (spec.map.threat_zones?.length ?? 0) > 0 ? (
                <div className="mt-2">
                  <MapAnnotationLegend spec={spec} />
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1">
                  <i className="legend-usn" /> 红方 USN（美）
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="legend-ijn" /> 蓝方 IJN（日）
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="legend-dmg" /> 损伤
                </span>
                <span>菱形=舰 · 三角=在空机 · 圆点=设施 · 虚线=作战轴</span>
                <span>右上角可切换底图（默认卫星影像，便于看清中途岛）</span>
              </div>
            </div>

            <SituationCharts
              charts={spec.charts}
              threatRatings={spec.threat_ratings}
            />
          </>
        )}
      </main>
    </div>
  );
}
