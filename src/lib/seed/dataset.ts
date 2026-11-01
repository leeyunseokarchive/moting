import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Review } from "../types";
import { clamp, sameName } from "../util";
import { COMPANY_TALENT, type CompanyTalent } from "./company-talent";
import { SAMPLE_REVIEWS } from "./reviews";

/**
 * 팀이 수집한 면접 데이터(data/moting). 사용 조건은 data/moting/README.md 참고.
 * 잡코리아·velog 후기는 비공개 시연용이므로 저장소 공개·상업 전환 시 빼야 한다(Review.source로 구분).
 */
const ROOT = path.join(process.cwd(), "data", "moting");
const SYNTHETIC_SOURCE = "hf-nembi-llm-job-interview"; // 가상 지원자 맥락이 질문에 박혀 있어 쓰지 않는다

type RawReview = {
  id: string;
  company: string;
  job: string;
  stage: string | null;
  format: { interviewers: number | null; duration_min: number | null; mode: string | null; coding_test: boolean | null; notes: string };
  questions: string[];
  atmosphere: string | null;
  pressure: number | null;
  source_site: string;
  added_at: string;
};

export type CompanyProfile = {
  company: string;
  companyType: string;
  industry: string;
  stages: { name: string; format: string | null; notes: string | null }[];
  evaluation_points: string[];
  facts: { text: string; source_url: string }[];
  talent: CompanyTalent | null;
};

export type BankQuestion = {
  id: string;
  source_id: string;
  source_url: string | null;
  license: string;
  lang: string;
  role: string;
  interview_type: string;
  question: string;
  question_origin: string;
  tags: string[];
};

const readLines = <T>(file: string): T[] =>
  fs
    .readFileSync(path.join(ROOT, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

function once<T>(load: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= load());
}

const profiles = once<CompanyProfile[]>(() => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "company_profiles.json"), "utf8")) as {
    companies: Omit<CompanyProfile, "talent">[];
    alternates: Omit<CompanyProfile, "talent">[];
  };
  return [...raw.companies, ...raw.alternates].map((p) => ({
    ...p,
    talent: COMPANY_TALENT.find((t) => sameName(t.company, p.company)) ?? null,
  }));
});

export function companyProfile(company: string): CompanyProfile | null {
  return profiles().find((p) => sameName(p.company, company)) ?? null;
}

function formatText({ interviewers, duration_min, mode, coding_test, notes }: RawReview["format"]): string {
  return [
    interviewers && `면접관 ${interviewers}명`,
    duration_min && `${duration_min}분`,
    mode,
    coding_test && "코딩테스트 포함",
    notes,
  ]
    .filter(Boolean)
    .join(", ");
}

export const datasetReviews = once<Review[]>(() =>
  readLines<RawReview>("interview_reviews.jsonl").map((r) => {
    const profile = companyProfile(r.company);
    return {
      id: `dataset_${r.id}`,
      company: profile?.company ?? r.company,
      job: r.job,
      industry: profile?.industry ?? "",
      companyType: profile?.companyType ?? "기타",
      stage: r.stage ?? "",
      format: formatText(r.format),
      interviewerCount: clamp(r.format.interviewers ?? 2, 1, 5),
      questions: r.questions,
      atmosphere: r.atmosphere ?? "",
      pressure: r.pressure ?? 3,
      tips: "",
      source: r.source_site,
      collectedAt: r.added_at.slice(0, 10),
      status: "approved",
      isSample: false,
    };
  }),
);

export const seedReviews = once<Review[]>(() => [...SAMPLE_REVIEWS, ...datasetReviews()]);

const bank = once<BankQuestion[]>(() =>
  fs
    .readdirSync(path.join(ROOT, "questions"))
    .flatMap((f) => readLines<BankQuestion>(path.join("questions", f)))
    .filter(
      (q) => q.lang === "ko" && (q.interview_type === "technical" || q.interview_type === "case") && q.source_id !== SYNTHETIC_SOURCE,
    ),
);

const ROLE_PATTERNS: [string, RegExp][] = [
  ["backend", /백엔드|서버|back-?end|server/i],
  ["frontend", /프론트|front-?end|웹/i],
  ["mobile", /모바일|안드로이드|android|ios|앱/i],
  ["ml", /머신러닝|딥러닝|인공지능|\b(?:ai|ml|llm)\b/i],
  ["data", /데이터|\bdata\b/i],
  ["devops", /devops|인프라|클라우드|\bsre\b/i],
  ["security", /보안|security/i],
];

/** 직무명 → 질문 은행 역할. 비개발 직무는 은행에 질문이 없어 빈 배열이다. */
export function bankRoles(job: string): string[] {
  const roles = ROLE_PATTERNS.filter(([, re]) => re.test(job)).map(([role]) => role);
  if (roles.length === 0 && /개발|엔지니어|소프트웨어|전산|\b(?:sw|it)\b/i.test(job)) roles.push("backend");
  return roles.length ? [...roles, "cs"] : [];
}

/** 직무에 맞는 은행 질문. 지원자 서류의 키워드와 겹치고 원문이 질문인 것을 앞에 두되 세션마다 조금씩 섞는다. */
export function bankCandidates(job: string, keywords: string, limit = 12): BankQuestion[] {
  const roles = new Set(bankRoles(job));
  const words = new Set(keywords.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}|[가-힣]{3,}/g) ?? []);
  const score = (q: BankQuestion) => {
    const text = q.question.toLowerCase();
    return [...words].filter((w) => text.includes(w)).length * 3 + (q.question_origin === "verbatim" ? 1 : 0) + Math.random();
  };
  return bank()
    .filter((q) => roles.has(q.role))
    .map((q) => ({ q, s: score(q) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.q);
}
