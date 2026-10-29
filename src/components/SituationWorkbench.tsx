"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SpatialStudyPanel } from "@/components/SpatialStudyPanel";
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
  Map as MapIcon,
  Sparkles,
} from "lucide-react";

export function SituationWorkbench() {
  const [index, setIndex] = useState<SliceIndexItem[]>([]);
  const [sliceId, setSliceId] = useState("T1");
  const [pack, setPack] = useState<SlicePack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<SituationViewSpec | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [taskFocus, setTaskFocus] = useState<TaskFocus>("threat");
  /** 刷新前按切片缓存本地结果，换切片再回来可复用 */
  const [specCache, setSpecCache] = useState<
    Partial<Record<string, SituationViewSpec>>
  >({});
  const sliceRef = useRef(sliceId);
  sliceRef.current = sliceId;
  const cacheRef = useRef(specCache);
  cacheRef.current = specCache;

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
    fetch(item.path)
      .then((r) => r.json())
      .then((data: SlicePack) => setPack(data))
      .catch((e) => setError(String(e)));
  }, [sliceId, index]);

  const generate = useCallback(
    async (force = true) => {
      if (!pack) return;
      const requestSlice = sliceId;
      if (!force && cacheRef.current[requestSlice]) {
        setSpec(cacheRef.current[requestSlice]!);
        setFallbackNote(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      setFallbackNote(null);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time_slice: requestSlice,
            mode: "local",
          }),
        });
        const data = (await res.json()) as GenerateResponse & {
          spec: SituationViewSpec | null;
        };
        if (!res.ok || !data.ok || !data.spec) {
          throw new Error(data.error || "生成失败");
        }
        const next = normalizeSituationSpec(data.spec);
        setSpecCache((prev) => ({ ...prev, [requestSlice]: next }));
        if (sliceRef.current === requestSlice) {
          setSpec(next);
          if (data.used_fallback) {
            setFallbackNote(data.error || "已回退本地生成器");
          }
        }
      } catch (e) {
        if (sliceRef.current === requestSlice) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (sliceRef.current === requestSlice) setLoading(false);
      }
    },
    [pack, sliceId],
  );

  useEffect(() => {
    if (!pack) return;
    const cached = cacheRef.current[sliceId];
    if (cached) {
      setSpec(cached);
      setFallbackNote(null);
      setError(null);
      setLoading(false);
      return;
    }
    void generate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, sliceId]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-1.5">
          <div className="mr-1 flex items-center gap-1.5">
            <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
            <div className="font-display text-sm leading-none tracking-wide">
              中途岛态势生成台
            </div>
            <span className="rounded bg-[var(--panel-2)] px-1 py-px text-[9px] text-[var(--muted)] ring-1 ring-[var(--line)]">
              本地基线
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {index.map((s) => (
              <button
                key={s.id}
                onClick={() => setSliceId(s.id)}
                className={`rounded px-2 py-0.5 text-[11px] ring-1 transition ${
                  sliceId === s.id
                    ? "bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent)]"
                    : "bg-[var(--panel-2)] text-[var(--ink)] ring-[var(--line)] hover:bg-[var(--panel-3)]"
                }`}
              >
                {s.id}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded text-[11px] ring-1 ring-[var(--line)]">
            <button
              type="button"
              className={`px-2 py-0.5 ${taskFocus === "threat" ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("threat")}
            >
              威胁分析
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 ${taskFocus === "intent" ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]" : "bg-[var(--panel-2)]"}`}
              onClick={() => setTaskFocus("intent")}
            >
              意图研判
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Link
              href="/compare"
              className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-fg)] hover:opacity-90"
            >
              <ArrowLeftRight className="h-3 w-3" />
              VMMP 对比
            </Link>
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => void generate(true)}
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
        {(error || fallbackNote) && (
          <section className="flex gap-2 rounded-lg bg-[#f8efe4] p-3 text-xs text-[#7a4b12] ring-1 ring-[#e0c4a0]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>{error || fallbackNote}</div>
          </section>
        )}

        {!spec || !pack ? (
          <div className="flex h-[70vh] items-center justify-center rounded-lg bg-[var(--panel)] text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
            {loading ? "正在生成态势界面…" : "等待数据…"}
          </div>
        ) : (
          <SpatialStudyPanel
            pack={pack}
            spec={spec}
            taskFocus={taskFocus}
            label={
              taskFocus === "intent"
                ? "意图研判 · 本地基线"
                : "威胁分析 · 本地基线"
            }
            richCharts={false}
            mapKey={`main-${sliceId}-${taskFocus}`}
          />
        )}
      </main>
    </div>
  );
}
