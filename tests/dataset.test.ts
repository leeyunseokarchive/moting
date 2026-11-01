import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchReviews } from "../src/lib/pipeline/match";
import { buildSetup } from "../src/lib/pipeline/setup";
import { bankCandidates, bankRoles, companyProfile, datasetReviews, seedReviews } from "../src/lib/seed/dataset";
import { SAMPLE_REVIEWS } from "../src/lib/seed/reviews";
import { FileStore } from "../src/lib/store/file";
import { ParsedInputSchema, ReviewSchema, type ParsedInput } from "../src/lib/types";

const parsed = (company: string, job: string, extra: Partial<ParsedInput> = {}) =>
  ParsedInputSchema.parse({ company, job, companyType: "대기업", ...extra });

describe("후기 시드", () => {
  it("186건을 전부 앱 스키마로 옮기고 출처를 남긴다", () => {
    const all = datasetReviews();
    expect(all).toHaveLength(186);
    for (const r of all) expect(ReviewSchema.safeParse(r).success).toBe(true);
    expect(new Set(all.map((r) => r.id)).size).toBe(186);
    expect(new Set(all.map((r) => r.source))).toEqual(new Set(["잡코리아", "velog"]));
  });

  it("약칭 후기도 공식 회사명과 기업 유형으로 묶는다", () => {
    const etri = datasetReviews().find((r) => r.company.includes("ETRI"));
    expect(etri?.company).toBe("한국전자통신연구원(ETRI)");
    expect(etri?.companyType).toBe("공기업");
    expect(datasetReviews().some((r) => r.company === "한국인터넷진흥원(KISA)")).toBe(true);
  });

  it("예시 후기를 유지한다", () => {
    expect(seedReviews()).toHaveLength(186 + SAMPLE_REVIEWS.length);
  });

  it("매칭은 내용 없는 후기로 자리를 채우지 않는다", () => {
    const match = matchReviews(parsed("네이버", "백엔드 개발자"), seedReviews());
    const picked = seedReviews().filter((r) => match.reviewIds.includes(r.id));
    expect(picked.length).toBeGreaterThan(0);
    for (const r of picked) expect(r.questions.length > 0 || r.atmosphere).toBeTruthy();
  });
});

describe("회사 프로필", () => {
  it("약칭으로 찾고 대체 후보까지 본다", () => {
    expect(companyProfile("삼성전자")?.evaluation_points).toContain("조직 적합성");
    expect(companyProfile("ETRI")?.company).toContain("한국전자통신연구원");
    expect(companyProfile("KISA")?.company).toContain("한국인터넷진흥원");
    expect(companyProfile("없는회사")).toBeNull();
  });

  it("공식 평가 포인트를 면접장 설정과 질문 설계에 반영한다", async () => {
    const { profile, plan } = await buildSetup(parsed("삼성전자", "소프트웨어 개발"), { tier: "default", reviewIds: [], summary: "" }, [], "");
    expect(profile.evaluationPoints.slice(0, 2)).toEqual(["전공 역량", "직무 동기"]);
    for (const iv of profile.interviewers) expect(iv.name).not.toMatch(/\s/); // 직함은 role에만 둔다
    expect(plan.filter((q) => q.intent.includes("평가 포인트")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("인재상", () => {
  it("약칭으로 찾고 출처 없는 회사는 비워 둔다", () => {
    expect(companyProfile("토스")?.talent?.talent).toContain("완벽보다 실행");
    expect(companyProfile("토스")?.talent?.restricted).toBe(true);
    expect(companyProfile("삼성전자")?.talent?.kind).toBe("official");
    expect(companyProfile("ETRI")?.talent).toBeNull();
    expect(companyProfile("한전KDN")?.talent).toBeNull();
    expect(companyProfile("KISA")?.talent).toBeNull();
  });

  it("인재상을 평가 기준, 질문, 근거 표시에 반영한다", async () => {
    const { profile, plan } = await buildSetup(parsed("토스", "서버 개발자"), { tier: "default", reviewIds: [], summary: "" }, [], "");
    expect(profile.evaluationPoints).toContain("완벽보다 실행");
    expect(plan.some((q) => q.intent === "평가 포인트: 개인보다 미션 우선")).toBe(true);
    expect(profile.evidence.some((e) => e.reviewId === "company_talent" && e.note.includes("toss.im"))).toBe(true);
  });
});

describe("질문 은행", () => {
  it("직무를 역할로 바꾸고 비개발 직무는 쓰지 않는다", () => {
    expect(bankRoles("백엔드 개발자")).toEqual(["backend", "cs"]);
    expect(bankRoles("iOS 개발")).toContain("mobile");
    expect(bankRoles("소프트웨어 개발")).toEqual(["backend", "cs"]);
    expect(bankRoles("마케팅")).toEqual([]);
  });

  it("한국어 기술 질문만 고르고 합성 데이터를 뺀다", () => {
    const picked = bankCandidates("머신러닝 엔지니어", "", 500);
    expect(picked.length).toBeGreaterThan(100);
    for (const q of picked) {
      expect(q.lang).toBe("ko");
      expect(q.interview_type).toMatch(/technical|case/);
      expect(q.source_id).not.toBe("hf-nembi-llm-job-interview");
    }
  });

  it("지원자 키워드와 맞는 질문을 앞에 둔다", () => {
    const top = bankCandidates("백엔드 개발자", "Redis Kafka 트랜잭션", 6);
    expect(top.some((q) => /redis|kafka|트랜잭션/i.test(q.question))).toBe(true);
  });

  it("은행 질문에는 출처를 남기고 실제 출제로 표시하지 않는다", async () => {
    const { plan } = await buildSetup(parsed("쿠팡", "백엔드 개발자"), { tier: "default", reviewIds: [], summary: "" }, [], "");
    const banked = plan.filter((q) => q.source === "bank");
    expect(banked.length).toBeGreaterThan(0);
    for (const q of banked) {
      expect(q.credit?.license).toBeTruthy();
      expect(q.credit?.url).toMatch(/^https:/);
    }
  });
});

describe("FileStore 후기 저장", () => {
  it("동시에 저장해도 파일이 깨지지 않고, 시드는 저장본이 덮는다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "moting-store-"));
    const s = new FileStore(dir);
    const seed = seedReviews().slice(0, 40);
    await Promise.all(seed.map((r) => s.saveReviews([{ ...r, embedding: [1, 2, 3] }])));
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, "reviews.json"), "utf8")) as unknown[];
    expect(onDisk).toHaveLength(40);
    const all = await s.listReviews();
    expect(all).toHaveLength(seedReviews().length);
    expect(all.filter((r) => r.embedding)).toHaveLength(40);
    await fs.rm(dir, { recursive: true });
  });
});
