import "server-only";
import { generateJSON } from "../gemini";
import { env, providers } from "../env";
import { ParsedInputSchema, type InputDoc, type ParsedInput } from "../types";

const LABEL: Record<InputDoc["kind"], string> = {
  posting: "채용공고",
  coverLetter: "자기소개서",
  resume: "이력서",
  guideEmail: "면접 안내 이메일",
  review: "사용자가 붙여넣은 면접 후기",
};

const SYSTEM = `너는 채용 서류를 구조화하는 파서다. 주어진 문서에서 사실만 뽑아 JSON으로 답한다.
- 없는 정보는 빈 문자열/빈 배열/0으로 둔다. 추측하지 않는다.
- companyType은 대기업, 중견기업, 공기업, 스타트업, 외국계, 기타 중 하나.
- coverLetterClaims: 자소서에서 면접관이 검증하고 싶어 할 주장(수치, 성과, 역할)을 최대 8개.
- candidateHighlights: 이력서의 핵심 경험·기술을 최대 8개, 짧은 구절로.
- emailFacts: 면접 안내 이메일이 있을 때만 형식(예: "다대일 3:1, 30분"), 면접관 수, 시간(분), 기타 안내.
- stage: 공고·이메일에 나온 전형 단계(예: "1차 실무면접"). 없으면 "1차 면접".`;

export async function parseInputs(docs: InputDoc[]): Promise<ParsedInput> {
  if (!providers().llm) return fallbackParse(docs);

  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  for (const d of docs) {
    parts.push({ text: `\n[${LABEL[d.kind]}${d.fileName ? ` · ${d.fileName}` : ""}]\n${d.text.slice(0, 20000)}` });
    if (d.pdfBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: d.pdfBase64 } });
  }
  parts.push({ text: "\n위 문서를 스키마에 맞춰 JSON으로 정리해 줘." });

  try {
    return await generateJSON(ParsedInputSchema, {
      model: env.models.smart,
      system: SYSTEM,
      parts,
      thinking: "low",
      timeoutMs: 60000,
    });
  } catch (e) {
    console.error("[parse] Gemini 실패, 대체 파서 사용", e);
    return fallbackParse(docs);
  }
}

/** 키가 없거나 실패했을 때 쓰는 단순 규칙 파서 */
export function fallbackParse(docs: InputDoc[]): ParsedInput {
  const text = (k: InputDoc["kind"]) => docs.filter((d) => d.kind === k).map((d) => d.text).join("\n");
  const posting = text("posting");
  const company =
    posting.match(/(?:회사명|기업명|회사)\s*[:：]\s*([^\n]+)/)?.[1]?.trim() ??
    posting.match(/([가-힣A-Za-z0-9&]+(?:전자|소프트|은행|공사|커머스|모빌리티|그룹|증권|건설|제약|화학|에너지|통신|게임즈|랩스))/)?.[1] ??
    "";
  const job =
    posting.match(/(?:모집\s*(?:분야|직무)|직무|포지션)\s*[:：]\s*([^\n]+)/)?.[1]?.trim() ??
    posting.match(/(백엔드|프론트엔드|소프트웨어|데이터|마케팅|기획|디자인|영업|인사|재무|전산|행정)[^\n,]{0,10}/)?.[0] ??
    "";
  const companyType = /공사|공단|진흥원|공기업/.test(posting)
    ? "공기업"
    : /스타트업|시리즈\s?[A-C]/.test(posting)
      ? "스타트업"
      : /그룹|대기업|전자|은행/.test(posting)
        ? "대기업"
        : "기타";
  const claims = text("coverLetter")
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s) && s.length > 12)
    .slice(0, 6)
    .map((claim) => ({ claim, detail: "" }));
  const email = text("guideEmail");
  const emailInterviewers = Number(email.match(/(\d)\s*(?::|대)\s*1/)?.[1] ?? 0);
  const emailMin = Number(email.match(/(\d{2})\s*분/)?.[1] ?? 0);
  return ParsedInputSchema.parse({
    company,
    job,
    companyType,
    industry: "",
    postingSummary: posting.slice(0, 300),
    requirements: posting
      .split("\n")
      .filter((l) => /^\s*[-•·]/.test(l))
      .slice(0, 6)
      .map((l) => l.replace(/^\s*[-•·]\s*/, "")),
    candidateHighlights: text("resume")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 6)
      .slice(0, 6),
    coverLetterClaims: claims,
    emailFacts: {
      format: email ? email.split("\n").find((l) => /면접|형식|방식/.test(l))?.trim() ?? "" : "",
      interviewers: Math.min(5, emailInterviewers),
      durationMin: Math.min(120, emailMin),
      notes: email.slice(0, 200),
    },
  });
}
