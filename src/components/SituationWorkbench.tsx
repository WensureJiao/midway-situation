"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SituationCharts } from "@/components/SituationCharts";
import type {
  AnalysisTask,
  GenerateResponse,
  SituationViewSpec,
  SliceIndexItem,
  SlicePack,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";
import {
  AlertTriangle,
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

function levelClass(level: string) {
  if (level.includes("紧急")) return "badge-critical";
  if (level.includes("高")) return "badge-high";
  if (level.includes("中")) return "badge-mid";
  return "badge-low";
}

export function SituationWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T1");
  const [pack, setPack] = useState<SlicePack | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("local");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [spec, setSpec] = useState<SituationViewSpec | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  const allTasks: AnalysisTask[] = useMemo(() => {
    if (!pack) return [];
    return [...(pack.intent.tasks ?? []), ...(pack.threat.tasks ?? [])];
  }, [pack]);

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
      .then((data: SlicePack) => {
        setPack(data);
        setSelectedTasks([
          ...(data.intent.tasks ?? []).map((t) => t.task_id),
          ...(data.threat.tasks ?? []).map((t) => t.task_id),
        ]);
      })
      .catch((e) => setError(String(e)));
  }, [sliceId, index]);

  const toggleTask = (id: string) => {
    setSelectedTasks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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
          task_ids: selectedTasks,
        }),
      });
      const data = (await res.json()) as GenerateResponse & {
        spec: SituationViewSpec | null;
      };
      if (!res.ok || !data.ok || !data.spec) {
        throw new Error(data.error || "生成失败");
      }
      setSystemPrompt(data.system_prompt);
      setPrompt(data.prompt);
      setSpec(normalizeSituationSpec(data.spec));
      if (data.used_fallback) {
        setFallbackNote(data.error || "已回退本地生成器");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pack, sliceId, mode, selectedTasks]);

  useEffect(() => {
    if (pack && selectedTasks.length && !spec && !loading) {
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
            <div>
              <div className="font-display text-lg leading-none tracking-wide">
                中途岛态势生成台
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                数据 + 任务 → 提示词 → 地图 COP / 统计图
              </div>
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
              onClick={() => setShowPrompt((v) => !v)}
            >
              <Terminal className="h-3.5 w-3.5" />
              提示词
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

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <section className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
            <h2 className="mb-1 text-sm font-semibold">时间片</h2>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              {pack?.phase_label ?? "加载中…"}
            </p>
          </section>

          <section className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">分析任务输入</h2>
              <span className="text-[10px] text-[var(--muted)]">
                {selectedTasks.length}/{allTasks.length}
              </span>
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
              {allTasks.map((t) => {
                const on = selectedTasks.includes(t.task_id);
                return (
                  <label
                    key={t.task_id}
                    className={`block cursor-pointer rounded-md p-2 text-xs ring-1 transition ${
                      on
                        ? "bg-[var(--panel-2)] ring-[var(--accent)]/50"
                        : "ring-[var(--line)] opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={on}
                        onChange={() => toggleTask(t.task_id)}
                      />
                      <div>
                        <div className="font-medium">
                          {t.task_id} · {t.capability}
                        </div>
                        <div className="text-[var(--muted)]">{t.category}</div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {(error || fallbackNote) && (
            <section className="flex gap-2 rounded-lg bg-[#f8efe4] p-3 text-xs text-[#7a4b12] ring-1 ring-[#e0c4a0]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>{error || fallbackNote}</div>
            </section>
          )}
        </aside>

        <section className="min-w-0 space-y-4">
          {showPrompt && (
            <div className="animate-in rounded-lg bg-[#1a2330] p-3 text-[#d7e0ea] ring-1 ring-[#2a384a]">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">组装后的提示词</h2>
                <span className="text-[10px] text-[#8fa0b3]">
                  System + User（可复制评测）
                </span>
              </div>
              <details className="mb-2">
                <summary className="cursor-pointer text-xs text-[#9eb0c4]">
                  System Prompt
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed opacity-90">
                  {systemPrompt || "尚未生成"}
                </pre>
              </details>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                {prompt || "尚未生成"}
              </pre>
            </div>
          )}

          {!spec || !pack ? (
            <div className="flex h-[70vh] items-center justify-center rounded-lg bg-[var(--panel)] text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
              {loading ? "正在根据数据与任务生成态势界面…" : "等待数据…"}
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
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <i className="legend-usn" /> 蓝方 USN
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <i className="legend-ijn" /> 红方 IJN
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

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
                  <h2 className="mb-2 text-sm font-semibold">意图研判</h2>
                  <div className="max-h-80 space-y-3 overflow-auto">
                    {spec.intent_findings.map((f) => (
                      <div key={f.task_id}>
                        <div className="text-xs font-medium text-[var(--accent-2)]">
                          {f.task_id} · {f.capability}
                        </div>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--ink)]/90">
                          {f.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {!spec.intent_findings.length && (
                      <p className="text-xs text-[var(--muted)]">未选意图任务</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
                  <h2 className="mb-2 text-sm font-semibold">威胁分析</h2>
                  <div className="max-h-80 space-y-3 overflow-auto">
                    {spec.threat_findings.map((f) => (
                      <div key={f.task_id}>
                        <div className="text-xs font-medium text-[var(--accent-2)]">
                          {f.task_id} · {f.capability}
                        </div>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--ink)]/90">
                          {f.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {!!spec.threat_ratings.length && (
                      <div className="border-t border-[var(--line)] pt-2">
                        <div className="mb-1.5 text-xs font-medium">威胁等级</div>
                        <div className="flex flex-wrap gap-1.5">
                          {spec.threat_ratings.map((r, i) => (
                            <span
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-[10px] ${levelClass(r.level)}`}
                              title={r.evidence}
                            >
                              {r.target} · {r.level}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!!spec.priorities.length && (
                <div className="grid gap-3 md:grid-cols-2">
                  {spec.priorities.map((p) => (
                    <div
                      key={p.side}
                      className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]"
                    >
                      <h2 className="mb-2 text-sm font-semibold">{p.label}</h2>
                      <ol className="space-y-1.5 text-xs">
                        {p.items.map((item) => (
                          <li
                            key={`${p.side}-${item.rank}`}
                            className="flex gap-2"
                          >
                            <span className="w-4 font-mono text-[var(--accent)]">
                              {item.rank}
                            </span>
                            <div>
                              <div className="font-medium">{item.target}</div>
                              <div className="text-[var(--muted)]">
                                {item.action}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
