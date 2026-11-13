export function uid(prefix = ""): string {
  const rand = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 회사명 비교용 정규화: 공백·괄호·(주)·주식회사 제거, 소문자 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|\s+|[()[\]·.,-]/g, "")
    .trim();
}

export function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 자소서를 거의 그대로 외워 말했다고 보는 기준(recitalRatio 값) */
export const RECITAL_THRESHOLD = 0.4;

/**
 * 답변이 원문(자소서)을 얼마나 그대로 되풀이했는지 0~1.
 * 공백·문장부호를 뺀 글자 n-gram 중 원문에도 있는 비율. 답변은 음성 인식 결과라 긴 일치는 드물어 n을 짧게 잡는다.
 */
export function recitalRatio(answer: string, source: string, n = 4): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const a = norm(answer);
  const src = norm(source);
  // 짧은 답변은 어미만 겹쳐도 비율이 튀므로 판단하지 않는다
  if (a.length < 40 || src.length < n) return 0;
  const grams = new Set<string>();
  for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n));
  let hit = 0;
  const total = a.length - n + 1;
  for (let i = 0; i < total; i++) if (grams.has(a.slice(i, i + n))) hit++;
  return hit / total;
}
