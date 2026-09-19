"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SituationCharts } from "@/components/SituationCharts";
import type {
  GenerateResponse,
  SituationViewSpec,
  SliceIndexItem,
  SlicePack,
  TaskFocus,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";
import {
  INTENT_E_CRITERIA,
  THREAT_E_CRITERIA,
  diffSpecs,
  meanScores,
} from "@/lib/vmmpCompare";
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
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

type SideKey = "A" | "B";
type ViewTab = "view" | "diff" | "score";

function VisPanel({
  label,
  badge,
  pack,
  spec,
  mapKey,
  blind,
}: {
  label: string;
  badge: string;
  pack: SlicePack;
  spec: SituationViewSpec;
  mapKey: string;
  blind: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-[var(--panel)] ring-1 ring-[var(--line)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg tracking-wide">
              {blind ? "方案" : label}
            </h2>
            <span className="rounded bg-[var(--panel-3)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--muted)]">
              {blind ? "?" : badge}
            </span>
          </div>
          <p className="truncate text-xs text-[var(--muted)]">
            {spec.title}
            <span className="mx-1">·</span>
            {spec.phase_label}
          </p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-[var(--muted)]">
          高亮 {spec.map.highlight_names?.length ?? 0}
          <br />
          轴 {spec.map.axes?.length ?? 0} · 圈{" "}
          {spec.map.threat_zones?.length ?? 0}
          <br />
          图 {spec.charts?.length ?? 0}
        </div>
      </div>

      <div className="map-shell h-[min(46vh,460px)] overflow-hidden">
        <SituationMap pack={pack} spec={spec} instanceKey={mapKey} />
      </div>

      <div className="border-t border-[var(--line)] p-2">
        <SituationCharts
          charts={spec.charts}
          threatRatings={spec.threat_ratings}
        />
      </div>
    </section>
  );
}

function ScoreColumn({
  title,
  criteria,
  scores,
  onChange,
}: {
  title: string;
  criteria: readonly { id: string; label: string }[];
  scores: Record<string, number>;
  onChange: (id: string, v: number) => void;
}) {
  const mean = meanScores(scores);
  return (
    <div className="rounded-lg bg-[var(--panel-2)] p-2 ring-1 ring-[var(--line)]">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold">{title}</h4>
        <span className="text-[11px] text-[var(--muted)]">
          均分 {mean == null ? "—" : mean.toFixed(2)}
        </span>
      </div>
      <div className="space-y-1.5">
        {criteria.map((c) => (
          <label
            key={c.id}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate" title={c.label}>
              {c.label}
            </span>
            <select
              className="rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5"
              value={scores[c.id] ?? 0}
              onChange={(e) => onChange(c.id, Number(e.target.value))}
            >
              <option value={0}>—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function chartTitles(spec: SituationViewSpec): string[] {
  return (spec.charts ?? []).map((c) => c.title);
}

export function VmmpCompareWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T1");
  const [taskFocus, setTaskFocus] = useState<TaskFocus>("threat");
  const [pack, setPack] = useState<SlicePack | null>(null);
  const [specA, setSpecA] = useState<SituationViewSpec | null>(null);
  const [specB, setSpecB] = useState<SituationViewSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [blind, setBlind] = useState(false);
  const [swapBlind, setSwapBlind] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("view");
  const [scoresA, setScoresA] = useState<Record<string, number>>({});
  const [scoresB, setScoresB] = useState<Record<string, number>>({});

  const criteria =
    taskFocus === "threat" ? THREAT_E_CRITERIA : INTENT_E_CRITERIA;

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
    setSpecA(null);
    setSpecB(null);
    setScoresA({});
    setScoresB({});
    fetch(item.path)
      .then((r) => r.json())
      .then((data: SlicePack) => setPack(data))
      .catch((e) => setError(String(e)));
  }, [sliceId, index]);

  useEffect(() => {
    setScoresA({});
    setScoresB({});
  }, [taskFocus]);

  const tryLoadSaved = useCallback(async () => {
    const base = `/data/vmmp_ab_visual/${sliceId}-${taskFocus}`;
    try {
      const [ra, rb] = await Promise.all([
        fetch(`${base}-A.json`),
        fetch(`${base}-B.json`),
      ]);
      if (!ra.ok || !rb.ok) return false;
      const a = (await ra.json()) as SituationViewSpec;
      const b = (await rb.json()) as SituationViewSpec;
      setSpecA(normalizeSituationSpec(a));
      setSpecB(normalizeSituationSpec(b));
      setNotes([]);
      setSwapBlind(Math.random() < 0.5);
      return true;
    } catch {
      return false;
    }
  }, [sliceId, taskFocus]);

  useEffect(() => {
    if (!pack) return;
    void tryLoadSaved();
  }, [pack, tryLoadSaved]);

  const generatePair = useCallback(async () => {
    if (!pack) return;
    setLoading(true);
    setError(null);
    setNotes([]);
    setScoresA({});
    setScoresB({});
    setViewTab("view");
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

      const a = await callOne("off");
      const b = await callOne("on");
      setSpecA(a);
      setSpecB(b);
      setSwapBlind(Math.random() < 0.5);

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

  const diff = useMemo(
    () => (specA && specB ? diffSpecs(specA, specB) : null),
    [specA, specB],
  );

  const chartDiffLines = useMemo(() => {
    if (!specA || !specB) return [] as string[];
    const ta = chartTitles(specA);
    const tb = chartTitles(specB);
    if (ta.join("|") === tb.join("|")) {
      return [`图表标题相同：${ta.join("；") || "无"}`];
    }
    return [
      `A 图表：${ta.join("；") || "无"}`,
      `B 图表：${tb.join("；") || "无"}`,
    ];
  }, [specA, specB]);

  const leftRight = useMemo(() => {
    if (!specA || !specB) return null;
    if (blind && swapBlind) {
      return {
        left: { key: "B" as SideKey, spec: specB },
        right: { key: "A" as SideKey, spec: specA },
      };
    }
    return {
      left: { key: "A" as SideKey, spec: specA },
      right: { key: "B" as SideKey, spec: specB },
    };
  }, [specA, specB, blind, swapBlind]);

  const exportScores = () => {
    const meanA = meanScores(scoresA);
    const meanB = meanScores(scoresB);
    const rows = ["slice,task_focus,side,criterion,score,mean"];
    for (const side of ["A", "B"] as const) {
      const scores = side === "A" ? scoresA : scoresB;
      const mean = side === "A" ? meanA : meanB;
      for (const c of criteria) {
        rows.push(
          [
            sliceId,
            taskFocus,
            side,
            c.id,
            scores[c.id] ?? "",
            mean?.toFixed(2) ?? "",
          ].join(","),
        );
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vmmp-score-${sliceId}-${taskFocus}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-2 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-[var(--accent)]" />
            <div className="font-display text-lg leading-none tracking-wide">
              A/B 图像对比
            </div>
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
              className={`px-2.5 py-1.5 ${taskFocus === "threat" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("threat")}
            >
              威胁
            </button>
            <button
              type="button"
              className={`px-2.5 py-1.5 ${taskFocus === "intent" ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("intent")}
            >
              意图
            </button>
          </div>

          <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
            {(
              [
                ["view", "看图"],
                ["diff", "差异"],
                ["score", "打分"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`px-2.5 py-1.5 ${viewTab === id ? "bg-[var(--panel-3)] font-semibold" : "bg-[var(--panel-2)]"}`}
                onClick={() => setViewTab(id)}
                disabled={!specA || !specB}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setBlind((v) => !v)}
              disabled={!specA || !specB}
            >
              {blind ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {blind ? "揭晓" : "盲评"}
            </Button>
            <Link
              href="/"
              className="rounded-md px-2.5 py-1.5 text-xs ring-1 ring-[var(--line)] hover:bg-[var(--panel-2)]"
            >
              返回
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

      <main className="mx-auto max-w-[1800px] space-y-3 px-4 py-4">
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

        {!pack || !specA || !specB || !leftRight ? (
          <div className="flex h-[60vh] items-center justify-center rounded-lg bg-[var(--panel)] text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
            {loading
              ? "正在生成左右两套地图与图表（约 1–2 分钟）…"
              : "点「生成 A/B」开始对比。左 A 无范式，右 B 有 VMMP。"}
          </div>
        ) : viewTab === "view" ? (
          <>
            {blind && (
              <p className="text-[11px] text-[var(--muted)]">
                盲评中：左右标签已隐藏
                {swapBlind ? "（顺序已打乱）" : ""}。
              </p>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              <VisPanel
                label={
                  leftRight.left.key === "A" ? "A · 无范式" : "B · 有 VMMP"
                }
                badge={leftRight.left.key === "A" ? "A" : "B"}
                pack={pack}
                spec={leftRight.left.spec}
                mapKey={`left-${sliceId}-${taskFocus}-${leftRight.left.key}`}
                blind={blind}
              />
              <VisPanel
                label={
                  leftRight.right.key === "A" ? "A · 无范式" : "B · 有 VMMP"
                }
                badge={leftRight.right.key === "A" ? "A" : "B"}
                pack={pack}
                spec={leftRight.right.spec}
                mapKey={`right-${sliceId}-${taskFocus}-${leftRight.right.key}`}
                blind={blind}
              />
            </div>
          </>
        ) : viewTab === "diff" ? (
          <section className="rounded-lg bg-[var(--panel)] p-4 ring-1 ring-[var(--line)]">
            <h3 className="text-sm font-semibold">左右差在哪</h3>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              看完图再看这里，核对你肉眼看到的差别。
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm">
              {(diff?.summaryLines ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {chartDiffLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-md bg-[var(--panel-2)] p-3 ring-1 ring-[var(--line)]">
                <div className="font-semibold">A 叙述</div>
                <p className="mt-1 leading-relaxed">{specA.narrative}</p>
              </div>
              <div className="rounded-md bg-[var(--panel-2)] p-3 ring-1 ring-[var(--line)]">
                <div className="font-semibold">B 叙述</div>
                <p className="mt-1 leading-relaxed">{specB.narrative}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-lg bg-[var(--panel)] p-4 ring-1 ring-[var(--line)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">E 指标打分</h3>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={exportScores}
              >
                <Download className="h-3.5 w-3.5" />
                导出 CSV
              </Button>
            </div>
            <p className="mb-3 text-[11px] text-[var(--muted)]">
              按「是否更好支持当前任务」打 1–5，不要按好不好看。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreColumn
                title={blind ? "左侧方案" : "A · 无范式"}
                criteria={criteria}
                scores={leftRight.left.key === "A" ? scoresA : scoresB}
                onChange={(id, v) => {
                  if (leftRight.left.key === "A") {
                    setScoresA((s) => ({ ...s, [id]: v }));
                  } else {
                    setScoresB((s) => ({ ...s, [id]: v }));
                  }
                }}
              />
              <ScoreColumn
                title={blind ? "右侧方案" : "B · 有 VMMP"}
                criteria={criteria}
                scores={leftRight.right.key === "A" ? scoresA : scoresB}
                onChange={(id, v) => {
                  if (leftRight.right.key === "A") {
                    setScoresA((s) => ({ ...s, [id]: v }));
                  } else {
                    setScoresB((s) => ({ ...s, [id]: v }));
                  }
                }}
              />
            </div>
            {!blind && (
              <div className="mt-3 text-[11px] text-[var(--muted)]">
                A 均分 {meanScores(scoresA)?.toFixed(2) ?? "—"} · B 均分{" "}
                {meanScores(scoresB)?.toFixed(2) ?? "—"}
                {meanScores(scoresA) != null &&
                  meanScores(scoresB) != null && (
                    <>
                      {" "}
                      · 差值(B−A){" "}
                      {(
                        (meanScores(scoresB) as number) -
                        (meanScores(scoresA) as number)
                      ).toFixed(2)}
                    </>
                  )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
