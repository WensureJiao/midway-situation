"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/SituationCharts";
import { SpatialStudyPanel } from "@/components/SpatialStudyPanel";
import { buildTaskCompareCharts } from "@/lib/compareCharts";
import type {
  GenerateResponse,
  SituationViewSpec,
  SliceIndexItem,
  SlicePack,
  TaskFocus,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Sparkles,
} from "lucide-react";

type SpecPair = { a: SituationViewSpec; b: SituationViewSpec };

export function VmmpCompareWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T1");
  const [pack, setPack] = useState<SlicePack | null>(null);
  const [taskFocus, setTaskFocus] = useState<TaskFocus>("threat");
  const [pairs, setPairs] = useState<Partial<Record<TaskFocus, SpecPair>>>({});
  const [reasonThreatA, setReasonThreatA] = useState("");
  const [reasonThreatB, setReasonThreatB] = useState("");
  const [reasonIntentA, setReasonIntentA] = useState("");
  const [reasonIntentB, setReasonIntentB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [abSide, setAbSide] = useState<"A" | "B">("A");

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
    setPairs({});
    setReasonThreatA("");
    setReasonThreatB("");
    setReasonIntentA("");
    setReasonIntentB("");
    fetch(item.path)
      .then((r) => r.json())
      .then((data: SlicePack) => setPack(data))
      .catch((e) => setError(String(e)));
  }, [sliceId, index]);

  const loadReasoning = useCallback(async () => {
    const pull = async (
      focus: "threat" | "intent",
      side: "A" | "B",
    ) => {
      const res = await fetch(
        `/api/vmmp-reasoning?slice=${sliceId}&focus=${focus}&side=${side}`,
      );
      const data = (await res.json()) as { ok?: boolean; text?: string };
      return data.ok ? (data.text ?? "") : "";
    };
    const [tA, tB, iA, iB] = await Promise.all([
      pull("threat", "A"),
      pull("threat", "B"),
      pull("intent", "A"),
      pull("intent", "B"),
    ]);
    setReasonThreatA(tA);
    setReasonThreatB(tB);
    setReasonIntentA(iA);
    setReasonIntentB(iB);
  }, [sliceId]);

  const tryLoadSaved = useCallback(
    async (focus: TaskFocus) => {
      const base = `/data/vmmp_ab_visual/${sliceId}-${focus}`;
      try {
        const [ra, rb] = await Promise.all([
          fetch(`${base}-A.json`),
          fetch(`${base}-B.json`),
        ]);
        if (!ra.ok || !rb.ok) return false;
        const a = normalizeSituationSpec(
          (await ra.json()) as SituationViewSpec,
        );
        const b = normalizeSituationSpec(
          (await rb.json()) as SituationViewSpec,
        );
        setPairs((prev) => ({ ...prev, [focus]: { a, b } }));
        setNotes([]);
        void loadReasoning();
        return true;
      } catch {
        return false;
      }
    },
    [sliceId, loadReasoning],
  );

  useEffect(() => {
    if (!pack) return;
    if (pairs[taskFocus]) return;
    void tryLoadSaved(taskFocus);
  }, [pack, taskFocus, pairs, tryLoadSaved]);

  const generatePair = useCallback(async () => {
    if (!pack) return;
    setLoading(true);
    setError(null);
    setNotes([]);
    const runNotes: string[] = [];
    try {
      const callOne = async (vmmp_mode: "off" | "on") => {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time_slice: sliceId,
            mode: "llm",
            task_focus: taskFocus,
            vmmp_mode,
            lock_charts: false,
          }),
        });
        const data = (await res.json()) as GenerateResponse & {
          spec: SituationViewSpec | null;
        };
        if (!res.ok || !data.ok || !data.spec) {
          throw new Error(data.error || "生成失败");
        }
        if (data.used_fallback) {
          runNotes.push(
            `${vmmp_mode === "off" ? "A" : "B"} 回退本地：${data.error || ""}`,
          );
        }
        return normalizeSituationSpec(data.spec);
      };

      const callReason = async (
        focus: "threat" | "intent",
        side: "A" | "B",
      ) => {
        const res = await fetch("/api/vmmp-reasoning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time_slice: sliceId,
            task_focus: focus,
            side,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          text?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          runNotes.push(
            `${side}·${focus === "threat" ? "威胁" : "意图"}推理未写出：${data.error || "失败"}`,
          );
          return "";
        }
        return data.text ?? "";
      };

      const [a, b, tA, tB, iA, iB] = await Promise.all([
        callOne("off"),
        callOne("on"),
        callReason("threat", "A"),
        callReason("threat", "B"),
        callReason("intent", "A"),
        callReason("intent", "B"),
      ]);
      setPairs((prev) => ({ ...prev, [taskFocus]: { a, b } }));
      setReasonThreatA(tA);
      setReasonThreatB(tB);
      setReasonIntentA(iA);
      setReasonIntentB(iB);

      try {
        const saveRes = await fetch("/api/vmmp-ab-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time_slice: sliceId,
            task_focus: taskFocus,
            spec_a: a,
            spec_b: b,
          }),
        });
        if (saveRes.ok) {
          runNotes.push("已保存，下次打开可直接对比");
        }
      } catch {
        /* ignore */
      }

      setNotes(runNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pack, sliceId, taskFocus]);

  const activePair = pairs[taskFocus];
  const specA = activePair?.a ?? null;
  const specB = activePair?.b ?? null;
  const activeSpec = abSide === "A" ? specA : specB;
  const activeThreatReason = abSide === "A" ? reasonThreatA : reasonThreatB;
  const activeIntentReason = abSide === "A" ? reasonIntentA : reasonIntentB;
  const rich = abSide === "B";

  /** B 扩展：威胁看方位雷达；意图看证据维度雷达（证据饼已在意图底栏） */
  const extensionChart = useMemo(() => {
    if (!pack || !activeSpec || !rich) return undefined;
    const charts = buildTaskCompareCharts(
      activeSpec,
      taskFocus,
      pack.phase_label,
      { rich: true, pack },
    );
    return taskFocus === "intent"
      ? charts.find((c) => c.id === "cmp-intent-evidence-radar")
      : charts.find((c) => c.id === "cmp-force-bearing");
  }, [pack, activeSpec, rich, taskFocus]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-2 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-[var(--accent)]" />
            <div className="font-display text-lg leading-none tracking-wide">
              VMMP 对比
            </div>
            <span className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] ring-1 ring-[var(--line)]">
              对比界面
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {index.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSliceId(s.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs ring-1 transition ${
                  sliceId === s.id
                    ? "bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent)]"
                    : "bg-[var(--panel-2)] ring-[var(--line)] hover:bg-[var(--panel-3)]"
                }`}
              >
                {s.id}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
            <button
              type="button"
              className={`px-2.5 py-1.5 ${taskFocus === "threat" ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("threat")}
            >
              威胁分析
            </button>
            <button
              type="button"
              className={`px-2.5 py-1.5 ${taskFocus === "intent" ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("intent")}
            >
              意图研判
            </button>
          </div>

          <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
            <button
              type="button"
              className={`px-2.5 py-1.5 ${abSide === "A" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
              onClick={() => setAbSide("A")}
              disabled={!specA}
            >
              A · 无范式
            </button>
            <button
              type="button"
              className={`px-2.5 py-1.5 ${abSide === "B" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
              onClick={() => setAbSide("B")}
              disabled={!specB}
            >
              B · 有 VMMP
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--panel-2)]"
            >
              返回本地
            </Link>
            <Button
              size="sm"
              onClick={() => void generatePair()}
              disabled={loading || !pack}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              生成 A/B
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        {(error || notes.length > 0) && (
          <section className="flex gap-2 rounded-lg bg-[#f8efe4] p-3 text-xs text-[#7a4b12] ring-1 ring-[#e0c4a0]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="space-y-1">
              {error && <div>{error}</div>}
              {notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          </section>
        )}

        {!pack || !specA || !specB || !activeSpec ? (
          <div className="flex h-[60vh] items-center justify-center rounded-lg bg-[var(--panel)] text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
            {loading
              ? "正在生成 A/B 态势与推理…"
              : `当前是${taskFocus === "intent" ? "意图研判" : "威胁分析"}。点「生成 A/B」写出这一任务，或切换到已有预存的任务。`}
          </div>
        ) : (
          <>
            <SpatialStudyPanel
              label={
                taskFocus === "intent"
                  ? abSide === "A"
                    ? "意图研判 · A · 无范式"
                    : "意图研判 · B · 有 VMMP"
                  : abSide === "A"
                    ? "威胁分析 · A · 无范式"
                    : "威胁分析 · B · 有 VMMP"
              }
              badge={abSide}
              pack={pack}
              spec={activeSpec}
              mapKey={`compare-${sliceId}-${taskFocus}-${abSide}`}
              taskFocus={taskFocus}
              reasoningThreat={activeThreatReason}
              reasoningIntent={activeIntentReason}
              richCharts={rich}
              showSkeletonDiff
            />

            {extensionChart ? (
              <section className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
                <div className="mb-2 px-1">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">
                    范式扩展图
                  </h3>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {taskFocus === "intent"
                      ? "仅有 VMMP 时出现：证据维度轮廓，对照底栏证据构成阅读"
                      : "仅有 VMMP 时出现：相对中途岛方位雷达，对照底栏分布阅读"}
                  </p>
                </div>
                <div className="max-w-md">
                  <ChartCard chart={extensionChart} compact showWhyType />
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}


