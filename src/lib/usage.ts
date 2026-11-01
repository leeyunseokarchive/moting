import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { providers } from "./env";

export type UsageLedger = {
  llmCalls: number;
  ttsCalls: number;
  embedCalls: number;
  deepgramTokens: number;
  simliTokens: number;
  interviewMinutes: number;
  updatedAt: string;
};

export type ApiQuotaStatus = {
  providers: ReturnType<typeof providers>;
  usage: UsageLedger;
  quotas: {
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

const DATA_DIR = path.join(process.cwd(), ".data");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

const DEFAULT_USAGE: UsageLedger = {
  llmCalls: 12,
  ttsCalls: 16,
  embedCalls: 3,
  deepgramTokens: 4,
  simliTokens: 6,
  interviewMinutes: 3.5,
  updatedAt: new Date().toISOString(),
};

let memoryUsage: UsageLedger | null = null;

async function readLedger(): Promise<UsageLedger> {
  if (memoryUsage) return memoryUsage;
  try {
    const raw = await fs.readFile(USAGE_FILE, "utf8");
    memoryUsage = { ...DEFAULT_USAGE, ...(JSON.parse(raw) as Partial<UsageLedger>) };
    return memoryUsage;
  } catch {
    memoryUsage = { ...DEFAULT_USAGE };
    return memoryUsage;
  }
}

export async function recordApiUsage(patch: Partial<Omit<UsageLedger, "updatedAt">>): Promise<void> {
  try {
    const cur = await readLedger();
    const next: UsageLedger = {
      llmCalls: cur.llmCalls + (patch.llmCalls ?? 0),
      ttsCalls: cur.ttsCalls + (patch.ttsCalls ?? 0),
      embedCalls: cur.embedCalls + (patch.embedCalls ?? 0),
      deepgramTokens: cur.deepgramTokens + (patch.deepgramTokens ?? 0),
      simliTokens: cur.simliTokens + (patch.simliTokens ?? 0),
      interviewMinutes: Number((cur.interviewMinutes + (patch.interviewMinutes ?? 0)).toFixed(2)),
      updatedAt: new Date().toISOString(),
    };
    memoryUsage = next;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USAGE_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* 파일 기록 실패는 무시 */
  }
}

export async function getApiQuotaStatus(): Promise<ApiQuotaStatus> {
  const usage = await readLedger();
  const p = providers();

  // 1) Simli: $10 기본 크레딧 (분당 약 $0.05 = 총 200분)
  const simliTotalUsd = 10.0;
  const simliTotalMin = 200;
  const simliUsedMin = Number(Math.max(usage.interviewMinutes, usage.simliTokens * 0.8).toFixed(1));
  const simliUsedUsd = Number(Math.min(simliTotalUsd, simliUsedMin * 0.05).toFixed(2));
  const simliRemainingUsd = Number(Math.max(0, simliTotalUsd - simliUsedUsd).toFixed(2));
  const simliRemainingMin = Number(Math.max(0, simliTotalMin - simliUsedMin).toFixed(1));
  const simliPct = Math.round((simliRemainingUsd / simliTotalUsd) * 100);

  // 2) Deepgram: $200 무료 크레딧 (Nova-3 스트리밍 분당 약 $0.0077)
  const dgTotalUsd = 200.0;
  const dgUsedMin = Math.max(usage.interviewMinutes, usage.deepgramTokens * 2.5);
  const dgUsedUsd = Number(Math.min(dgTotalUsd, dgUsedMin * 0.0077).toFixed(2));
  const dgRemainingUsd = Number(Math.max(0, dgTotalUsd - dgUsedUsd).toFixed(2));
  const dgPct = Math.round((dgRemainingUsd / dgTotalUsd) * 100);

  // 3) Gemini (Tier 1 Prepaid, 팀 시연 예산 $20 기준: LLM 호출당 평균 ~$0.004, TTS 호출당 ~$0.002)
  const geminiTotalUsd = 20.0;
  const geminiUsedUsd = Number(
    Math.min(geminiTotalUsd, usage.llmCalls * 0.004 + usage.ttsCalls * 0.002 + usage.embedCalls * 0.0005).toFixed(2),
  );
  const geminiRemainingUsd = Number(Math.max(0, geminiTotalUsd - geminiUsedUsd).toFixed(2));
  const geminiPct = Math.round((geminiRemainingUsd / geminiTotalUsd) * 100);

  // 1회 시연(약 8분) 기준 가장 병목인 Simli 잔여 시간으로 남은 시연 가능 횟수 계산
  const estimatedRunsLeft = Math.max(0, Math.floor(simliRemainingMin / 8));

  return {
    providers: p,
    usage,
    quotas: {
      simli: {
        label: "Simli 실시간 아바타",
        totalUsd: simliTotalUsd,
        usedUsd: simliUsedUsd,
        remainingUsd: simliRemainingUsd,
        totalMin: simliTotalMin,
        usedMin: simliUsedMin,
        remainingMin: simliRemainingMin,
        percentLeft: simliPct,
      },
      deepgram: {
        label: "Deepgram Nova-3 STT",
        totalUsd: dgTotalUsd,
        usedUsd: dgUsedUsd,
        remainingUsd: dgRemainingUsd,
        percentLeft: dgPct,
      },
      gemini: {
        label: "Gemini LLM · TTS",
        tier: "Tier 1 Prepaid",
        totalBudgetUsd: geminiTotalUsd,
        usedUsd: geminiUsedUsd,
        remainingUsd: geminiRemainingUsd,
        percentLeft: geminiPct,
      },
      estimatedRunsLeft,
    },
  };
}
