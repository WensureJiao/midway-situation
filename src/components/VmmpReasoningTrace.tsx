"use client";

import { useState } from "react";
import type { TaskFocus } from "@/lib/types";
import {
  INTENT_REASONING_PATH,
  THREAT_REASONING_PATH,
  parseCrotmeReasoning,
} from "@/lib/vmmpReasonParse";

type Props = {
  reasoningThreat?: string;
  reasoningIntent?: string;
  side: "A" | "B";
  observerLabel?: string;
  /** 由外层任务页锁定时，不再在推理块里二次切换任务 */
  lockedFocus?: TaskFocus;
};

export function VmmpReasoningTrace({
  reasoningThreat,
  reasoningIntent,
  side,
  observerLabel = "美方",
  lockedFocus,
}: Props) {
  const [focusState, setFocus] = useState<TaskFocus>(lockedFocus ?? "threat");
  const focus = lockedFocus ?? focusState;
  const reasoning =
    focus === "intent" ? reasoningIntent : reasoningThreat;
  const path =
    focus === "intent" ? INTENT_REASONING_PATH : THREAT_REASONING_PATH;
  const parsed = parseCrotmeReasoning(reasoning);
  const focusTitle =
    focus === "intent" ? "意图研判" : "威胁分析";
  const paradigmTitle =
    focus === "intent" ? "VMMP_I 意图推理" : "VMMP_W 威胁推理";

  return (
    <div className="rounded-md bg-[var(--panel-2)]/80 px-2.5 py-2 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            推理 · {observerLabel}视角
            {side === "B" ? ` · ${paradigmTitle}` : " · 无范式"}
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
            先结论、后过程；扩展图对照结论阅读。
          </p>
        </div>
        {lockedFocus ? null : (
          <div className="flex shrink-0 overflow-hidden rounded-md text-[10px] ring-1 ring-[var(--line)]">
            <button
              type="button"
              className={`px-2 py-1 ${
                focus === "threat"
                  ? "bg-[var(--panel-3)] font-semibold text-[var(--ink)]"
                  : "bg-[var(--panel)] text-[var(--muted)]"
              }`}
              onClick={() => setFocus("threat")}
            >
              威胁分析
            </button>
            <button
              type="button"
              className={`px-2 py-1 ${
                focus === "intent"
                  ? "bg-[var(--panel-3)] font-semibold text-[var(--ink)]"
                  : "bg-[var(--panel)] text-[var(--muted)]"
              }`}
              onClick={() => setFocus("intent")}
            >
              意图研判
            </button>
          </div>
        )}
      </div>

      <div className="mt-1.5 text-[10px] font-medium text-[var(--ink)]">
        当前：{focusTitle}
        {side === "B" && !parsed.structured && reasoning?.trim() ? (
          <span className="ml-2 font-normal text-[#a16207]">
            未按 CROTME 结构输出
          </span>
        ) : null}
      </div>

      {parsed.conclusion ? (
        <div className="mt-2 rounded-md bg-[var(--accent)]/10 px-2.5 py-2 ring-1 ring-[var(--accent)]/35">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
            结论
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-snug text-[var(--ink)]">
            {parsed.conclusion}
          </p>
        </div>
      ) : null}

      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        过程
      </div>

      {side === "A" ? (
        <>
          <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
            自由叙述（无固定 C/R/O/M/E）；主语仍是{observerLabel}观察者。
          </p>
          {(() => {
            const processText =
              parsed.freeform?.trim() ||
              (reasoning?.trim() && parsed.conclusion
                ? reasoning
                    .trim()
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(
                      (l) =>
                        l &&
                        !/^(?:结论|CONCLUSION)[:：]/i.test(l) &&
                        l !== parsed.conclusion,
                    )
                    .join("\n")
                    .trim()
                : "") ||
              (parsed.conclusion
                ? `依据简述：${parsed.conclusion}`
                : "");
            if (processText) {
              return (
                <div className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--ink)]">
                  {processText}
                </div>
              );
            }
            return (
              <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                暂无{focusTitle}推理；点「生成 A/B」可写出
              </p>
            );
          })()}
        </>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {path.map((step, i) => {
              const hit = parsed.O.some(
                (o) => o.step.toLowerCase() === step.toLowerCase(),
              );
              return (
                <span key={step} className="inline-flex items-center gap-1">
                  {i > 0 ? (
                    <span className="text-[9px] text-[var(--muted)]">→</span>
                  ) : null}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                      hit
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                        : "bg-[var(--panel)] text-[var(--muted)] ring-1 ring-[var(--line)]"
                    }`}
                  >
                    {step}
                  </span>
                </span>
              );
            })}
          </div>

          {parsed.structured ? (
            <dl className="mt-2 space-y-1.5 text-[10px] leading-snug">
              {parsed.C ? (
                <div>
                  <dt className="inline font-semibold text-[var(--ink)]">
                    C · 对象{" "}
                  </dt>
                  <dd className="inline text-[var(--muted)]">{parsed.C}</dd>
                </div>
              ) : null}
              {parsed.R ? (
                <div>
                  <dt className="inline font-semibold text-[var(--ink)]">
                    R · 关系{" "}
                  </dt>
                  <dd className="inline text-[var(--muted)]">{parsed.R}</dd>
                </div>
              ) : null}
              {parsed.O.length ? (
                <div>
                  <dt className="mb-0.5 font-semibold text-[var(--ink)]">
                    O · 操作路径
                  </dt>
                  <dd>
                    <ol className="list-decimal space-y-0.5 pl-3.5 text-[var(--muted)]">
                      {parsed.O.map((o, i) => (
                        <li key={`${o.step}-${i}`}>
                          <span className="font-medium text-[var(--ink)]">
                            {o.step}
                          </span>
                          ：{o.text}
                        </li>
                      ))}
                    </ol>
                  </dd>
                </div>
              ) : null}
              {parsed.M ? (
                <div>
                  <dt className="inline font-semibold text-[var(--ink)]">
                    M · 映射{" "}
                  </dt>
                  <dd className="inline text-[var(--muted)]">{parsed.M}</dd>
                </div>
              ) : null}
              {parsed.E ? (
                <div>
                  <dt className="inline font-semibold text-[var(--ink)]">
                    E · 自检{" "}
                  </dt>
                  <dd className="inline text-[var(--muted)]">{parsed.E}</dd>
                </div>
              ) : null}
            </dl>
          ) : reasoning?.trim() ? (
            <div className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--muted)]">
              {reasoning.trim()}
            </div>
          ) : (
            <p className="mt-1.5 text-[10px] text-[var(--muted)]">
              暂无{focusTitle}推理；点「生成 A/B」可写出
            </p>
          )}
        </>
      )}
    </div>
  );
}
