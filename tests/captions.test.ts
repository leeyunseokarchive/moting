import { describe, expect, it } from "vitest";
import { captionLines } from "../src/components/ui/captions";

describe("captionLines", () => {
  it("문장마다 새 줄로 시작한다", () => {
    expect(captionLines("네, 잘 들었습니다. 다음 질문입니다!  왜 지원하셨나요?")).toEqual([
      "네, 잘 들었습니다.",
      "다음 질문입니다!",
      "왜 지원하셨나요?",
    ]);
  });

  it("소수점과 약어에서는 끊지 않는다", () => {
    expect(captionLines("응답 시간을 1.2초로 줄였나요?")).toEqual(["응답 시간을 1.2초로 줄였나요?"]);
  });

  it("긴 문장은 어절을 지키며 고르게 나눈다", () => {
    const text = "이력서에 적어주신 프로젝트에서 가장 아쉬웠던 기술적 의사결정은 무엇이었고 다시 한다면 어떻게 바꾸시겠습니까?";
    const lines = captionLines(text, 36);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toBe(text);
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThan(12);
  });

  it("한 줄보다 긴 어절은 그대로 둔다", () => {
    expect(captionLines("가".repeat(50), 36)).toEqual(["가".repeat(50)]);
  });

  it("빈 문자열은 줄이 없다", () => {
    expect(captionLines("  ")).toEqual([]);
  });
});
