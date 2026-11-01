"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";

type ConfigQuotaResponse = {
  llm: boolean;
  tts: boolean;
  stt: boolean;
  avatar: boolean;
  storage: "supabase" | "file";
  usage?: {
    llmCalls: number;
    ttsCalls: number;
    embedCalls: number;
    deepgramTokens: number;
    simliTokens: number;
    interviewMinutes: number;
    updatedAt: string;
  };
  quotas?: {
    simli: {
      label: string;
      totalUsd: number;
      usedUsd: number;
      remainingUsd: number;
      totalMin: number;
      usedMin: number;
      remainingMin: number;
      percentLeft: number;
    };
    deepgram: {
      label: string;
      totalUsd: number;
      usedUsd: number;
      remainingUsd: number;
      percentLeft: number;
    };
    gemini: {
      label: string;
      tier: string;
      totalBudgetUsd: number;
      usedUsd: number;
      remainingUsd: number;
      percentLeft: number;
    };
    estimatedRunsLeft: number;
  };
};

export function ApiStatusButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ConfigQuotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as ConfigQuotaResponse);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const minPct = data?.quotas
    ? Math.min(data.quotas.simli.percentLeft, data.quotas.deepgram.percentLeft, data.quotas.gemini.percentLeft)
    : 98;
  const allReady = Boolean(data?.llm && data?.stt && data?.avatar);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-canvas px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink"
        title="공유 API 잔여 한도 및 연결 상태 확인"
        aria-label="API 잔여량 확인"
      >
        <Gauge size={16} className={allReady ? "text-accent" : "text-warn"} />
        <span className="hidden sm:inline">API</span>
        <span className="tabular font-semibold text-ink">{minPct}%</span>
      </button>

      {open && (
        <div className="pop absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-hairline/80 bg-white p-4 shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-2.5">
            <div>
              <p className="text-[14px] font-semibold text-ink">팀 공유 API 잔여 한도</p>
              <p className="text-[12px] text-ink-3">
                시연 가능 약 <strong className="text-ink">{data?.quotas?.estimatedRunsLeft ?? 24}회</strong> 남음 (8분 기준)
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full bg-canvas text-ink-2 hover:bg-fill hover:text-ink"
              title="잔여량 새로고침"
            >
              <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {data?.quotas ? (
            <div className="mt-3 space-y-3.5 text-[13px]">
              {/* Simli */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    {data.avatar ? (
                      <CheckCircle size={14} weight="fill" className="text-positive" />
                    ) : (
                      <WarningCircle size={14} weight="fill" className="text-warn" />
                    )}
                    {data.quotas.simli.label}
                  </span>
                  <span className="tabular text-[12px] text-ink-2">
                    {data.quotas.simli.remainingMin}분 남음 (${data.quotas.simli.remainingUsd.toFixed(2)})
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${data.quotas.simli.percentLeft}%` }}
                  />
                </div>
              </div>

              {/* Deepgram */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    {data.stt ? (
                      <CheckCircle size={14} weight="fill" className="text-positive" />
                    ) : (
                      <WarningCircle size={14} weight="fill" className="text-warn" />
                    )}
                    {data.quotas.deepgram.label}
                  </span>
                  <span className="tabular text-[12px] text-ink-2">
                    ${data.quotas.deepgram.remainingUsd.toFixed(2)} / ${data.quotas.deepgram.totalUsd}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                  <div
                    className="h-full rounded-full bg-positive transition-[width] duration-500"
                    style={{ width: `${data.quotas.deepgram.percentLeft}%` }}
                  />
                </div>
              </div>

              {/* Gemini */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    {data.llm ? (
                      <CheckCircle size={14} weight="fill" className="text-positive" />
                    ) : (
                      <WarningCircle size={14} weight="fill" className="text-warn" />
                    )}
                    {data.quotas.gemini.label}
                  </span>
                  <span className="tabular text-[12px] text-ink-2">
                    ${data.quotas.gemini.remainingUsd.toFixed(2)} / ${data.quotas.gemini.totalBudgetUsd}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${data.quotas.gemini.percentLeft}%` }}
                  />
                </div>
                <p className="text-[11px] text-ink-3">
                  누적 호출: LLM {data.usage?.llmCalls ?? 0}회 · TTS {data.usage?.ttsCalls ?? 0}회 · 아바타 {data.usage?.simliTokens ?? 0}회
                </p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-ink-3">API 상태를 불러오는 중...</p>
          )}
        </div>
      )}
    </div>
  );
}
