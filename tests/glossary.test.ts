import { describe, expect, it } from "vitest";
import { glossary } from "../src/lib/glossary";

const base = { terms: [], requirements: [], candidateHighlights: [], coverLetterClaims: [] };

describe("glossary", () => {
  it("서류 파서가 뽑은 용어를 먼저 쓰고 영문 기술명을 덧붙인다", () => {
    const g = glossary({
      ...base,
      terms: ["구조해석", "유한요소법"],
      candidateHighlights: ["PyTorch로 추론 서버 구축", "Python GIL 병목 분석."],
    });
    expect(g.slice(0, 2)).toEqual(["구조해석", "유한요소법"]);
    expect(g).toEqual(expect.arrayContaining(["PyTorch", "Python", "GIL"]));
  });

  it("대소문자만 다른 중복과 한 글자 토막은 뺀다", () => {
    const g = glossary({ ...base, terms: ["GIL", "gil", "a"], requirements: ["GIL 이해"] });
    expect(g).toEqual(["GIL"]);
  });

  it("terms가 없는 예전 세션도 동작한다", () => {
    const old = { requirements: ["React 경험"], candidateHighlights: [], coverLetterClaims: [] } as unknown as Parameters<typeof glossary>[0];
    expect(glossary(old)).toEqual(["React"]);
  });

  it("영문 일반 단어와 주소 토막은 용어로 보지 않는다", () => {
    const g = glossary({ ...base, requirements: ["Experience with React and TypeScript, see https://example.com"] });
    expect(g).toEqual(["Experience", "React", "TypeScript"]);
  });

  it("최대 60개로 자른다", () => {
    const terms = Array.from({ length: 100 }, (_, i) => `용어${i}`);
    expect(glossary({ ...base, terms })).toHaveLength(60);
  });
});
