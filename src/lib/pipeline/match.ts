import type { MatchResult, MatchTier, ParsedInput, Review } from "../types";
import { cosine, sameName } from "../util";

export type MatchOptions = {
  /** 입력(공고+직무)의 임베딩. 없으면 키워드 점수만 쓴다. */
  queryEmbedding?: number[];
  limit?: number;
};

const TIER_LABEL: Record<MatchTier, string> = {
  exact: "같은 회사·같은 직무",
  company: "같은 회사·다른 직무",
  similar: "비슷한 업종·기업 유형의 같은 직무",
  default: "기업 유형 기본값",
};

export function tierLabel(tier: MatchTier): string {
  return TIER_LABEL[tier];
}

/** 직무명 유사도: 같은 단어(2자 이상)를 공유하면 같은 직무로 본다. */
export function sameJob(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (sameName(a, b)) return true;
  const tokens = (s: string) =>
    new Set(
      s
        .replace(/[()·/,]/g, " ")
        .split(/\s+/)
        .map((t) => t.replace(/(직무|직군|분야|담당|팀)$/u, ""))
        .filter((t) => t.length >= 2),
    );
  const ta = tokens(a);
  for (const t of tokens(b)) if (ta.has(t)) return true;
  // 개발/엔지니어 계열 동의어
  const dev = /(개발|엔지니어|SW|소프트웨어|백엔드|프론트|서버|전산|IT)/i;
  return dev.test(a) && dev.test(b);
}

function keywordScore(parsed: ParsedInput, r: Review): number {
  let s = 0;
  if (sameJob(parsed.job, r.job)) s += 2;
  if (parsed.industry && r.industry && sameName(parsed.industry, r.industry)) s += 1.5;
  if (parsed.companyType && r.companyType === parsed.companyType) s += 1;
  if (parsed.stage && r.stage && sameName(parsed.stage, r.stage)) s += 0.5;
  return s;
}

/**
 * 후기 매칭. 가까운 단계부터 찾는다:
 * 1) 같은 회사·직무 2) 같은 회사 3) 비슷한 업종/기업 유형의 같은 직무 4) 기본값(상위 유사도)
 */
export function matchReviews(parsed: ParsedInput, reviews: Review[], opts: MatchOptions = {}): MatchResult {
  const limit = opts.limit ?? 8;
  const approved = reviews.filter((r) => r.status === "approved");

  const rank = (list: Review[]) =>
    [...list]
      .map((r) => ({
        r,
        score:
          keywordScore(parsed, r) +
          (opts.queryEmbedding && r.embedding ? cosine(opts.queryEmbedding, r.embedding) * 3 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);

  const sameCompany = approved.filter((r) => sameName(parsed.company, r.company));
  const exact = sameCompany.filter((r) => sameJob(parsed.job, r.job));

  let tier: MatchTier;
  let picked: Review[];
  if (exact.length > 0) {
    tier = "exact";
    picked = rank(exact);
  } else if (sameCompany.length > 0) {
    tier = "company";
    picked = rank(sameCompany);
  } else {
    const similar = approved.filter(
      (r) =>
        sameJob(parsed.job, r.job) &&
        ((parsed.industry && r.industry && sameName(parsed.industry, r.industry)) ||
          (parsed.companyType !== "기타" && r.companyType === parsed.companyType)),
    );
    if (similar.length > 0) {
      tier = "similar";
      picked = rank(similar);
    } else {
      tier = "default";
      picked = rank(approved).filter((r) => r.companyType === parsed.companyType || keywordScore(parsed, r) > 0);
      if (picked.length === 0) picked = rank(approved);
    }
  }

  // 코딩테스트·서류 단계처럼 내용이 빈 후기가 상위 자리를 차지하지 않게 한다
  const informative = picked.filter((r) => r.questions.length > 0 || r.atmosphere);
  picked = (informative.length ? informative : picked).slice(0, limit);
  const samples = picked.filter((r) => r.isSample).length;
  const summary =
    picked.length === 0
      ? "참고할 후기가 없어 일반적인 면접 구성을 사용합니다."
      : `${tierLabel(tier)} 후기 ${picked.length}건을 참고했습니다.${samples > 0 ? ` (예시 데이터 ${samples}건 포함)` : ""}`;

  return { tier, reviewIds: picked.map((r) => r.id), summary };
}
