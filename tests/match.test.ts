import { describe, expect, it } from "vitest";
import { matchReviews, sameJob } from "../src/lib/pipeline/match";
import { SAMPLE_REVIEWS } from "../src/lib/seed/reviews";
import { ParsedInputSchema } from "../src/lib/types";

const parsed = (p: Partial<ReturnType<typeof ParsedInputSchema.parse>>) => ParsedInputSchema.parse(p);

describe("matchReviews", () => {
  it("같은 회사·직무 후기가 있으면 exact 단계로 매칭한다", () => {
    const r = matchReviews(parsed({ company: "(주)한빛전자", job: "SW 개발", companyType: "대기업" }), SAMPLE_REVIEWS);
    expect(r.tier).toBe("exact");
    expect(r.reviewIds).toContain("sample_hanbit_sw_1");
    expect(r.reviewIds.every((id) => id.startsWith("sample_hanbit_sw"))).toBe(true);
  });

  it("같은 회사만 있으면 company 단계", () => {
    const r = matchReviews(parsed({ company: "한빛전자", job: "인사" }), SAMPLE_REVIEWS);
    expect(r.tier).toBe("company");
    expect(r.reviewIds.length).toBeGreaterThan(0);
  });

  it("회사가 없으면 같은 업종·직무 후기로 내려간다", () => {
    const r = matchReviews(
      parsed({ company: "새로운전자", job: "소프트웨어 개발", industry: "전자·반도체", companyType: "대기업" }),
      SAMPLE_REVIEWS,
    );
    expect(r.tier).toBe("similar");
    expect(r.reviewIds[0]).toMatch(/hanbit_sw/);
  });

  it("아무것도 맞지 않으면 default 단계로 상위 후기를 준다", () => {
    const r = matchReviews(parsed({ company: "없는회사", job: "조리", companyType: "기타" }), SAMPLE_REVIEWS);
    expect(r.tier).toBe("default");
    expect(r.reviewIds.length).toBeGreaterThan(0);
  });

  it("승인되지 않은 후기는 제외한다", () => {
    const pending = { ...SAMPLE_REVIEWS[0], id: "p1", status: "pending" as const };
    const r = matchReviews(parsed({ company: "한빛전자", job: "소프트웨어 개발" }), [pending]);
    expect(r.reviewIds).not.toContain("p1");
  });
});

describe("sameJob", () => {
  it("개발 계열 동의어를 같은 직무로 본다", () => {
    expect(sameJob("백엔드 개발자", "SW 엔지니어")).toBe(true);
    expect(sameJob("마케팅", "소프트웨어 개발")).toBe(false);
  });
});
