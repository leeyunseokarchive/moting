import type { ParsedInput } from "./types";

const MAX_TERMS = 60;
// 영문 약어·기술명(GIL, PyTorch, C++, Node.js). 한글 용어는 서류 파서가 뽑은 terms에서 온다
const LATIN_TERM = /[A-Za-z][A-Za-z0-9+#.-]{1,24}/g;

/**
 * 지원자 서류에서 나온 전문용어 목록.
 * 음성 인식(Deepgram keyterm)과 면접관·평가 프롬프트가 같은 목록을 쓴다.
 */
export function glossary(parsed: Pick<ParsedInput, "terms" | "requirements" | "candidateHighlights" | "coverLetterClaims">): string[] {
  const prose = [
    ...parsed.requirements,
    ...parsed.candidateHighlights,
    ...parsed.coverLetterClaims.flatMap((c) => [c.claim, c.detail]),
  ].join(" ");
  const seen = new Set<string>();
  const out: string[] = [];
  // 영문 토막은 대문자·숫자·기호가 있는 것만 받는다. with, and, https 같은 일반 단어가 자리를 차지하지 않게
  const latin = (prose.match(LATIN_TERM) ?? []).filter((t) => /[A-Z0-9+#]/.test(t));
  for (const raw of [...(parsed.terms ?? []), ...latin]) {
    const term = raw.trim().replace(/[.-]+$/, "");
    const key = term.toLowerCase();
    if (term.length < 2 || term.length > 30 || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}
