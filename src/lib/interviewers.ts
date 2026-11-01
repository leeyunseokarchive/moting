import type { Interviewer, TranscriptEntry } from "./types";

/** 면접관 외형(Simli 프리셋 얼굴)과 목소리(Gemini TTS 프리셋) 묶음 */
export type Persona = {
  key: string;
  faceId: string;
  portrait: string;
  gender: "male" | "female";
  voice: string;
  defaultName: string;
  look: string;
};

export const PERSONAS: Persona[] = [
  {
    key: "daniel",
    faceId: "03ce3ee8-db97-4150-a333-8f643d48fee9",
    portrait: "/portraits/daniel.jpg",
    gender: "male",
    voice: "Charon",
    defaultName: "박도현",
    look: "남성, 정장",
  },
  {
    key: "mei",
    faceId: "084479bf-de7c-4df0-8d9c-5484193ecd27",
    portrait: "/portraits/mei.jpg",
    gender: "female",
    voice: "Kore",
    defaultName: "김서연",
    look: "여성, 정장",
  },
  {
    key: "tina",
    faceId: "66d1f5af-9b9b-49e2-a97f-6f5f3d59a2d5",
    portrait: "/portraits/tina.jpg",
    gender: "female",
    voice: "Gacrux",
    defaultName: "이정민",
    look: "여성, 정장",
  },
  {
    key: "hank",
    faceId: "9fcd5739-bf66-49a5-b525-d02d7f0bc2fc",
    portrait: "/portraits/hank.jpg",
    gender: "male",
    voice: "Orus",
    defaultName: "최민호",
    look: "남성, 셔츠·안경",
  },
];

export function persona(key: string): Persona {
  return PERSONAS.find((p) => p.key === key) ?? PERSONAS[0];
}

/** 기존 세션에 저장된 외부 CDN URL이 깨져도 faceId 기준 로컬 초상화로 복구한다 */
export function resolvePortrait(iv: { faceId?: string; portrait?: string }): string {
  const byFace = iv.faceId ? PERSONAS.find((p) => p.faceId === iv.faceId) : undefined;
  if (byFace) return byFace.portrait;
  if (iv.portrait && iv.portrait.startsWith("/")) return iv.portrait;
  return PERSONAS[0].portrait;
}

/** 역할 순서대로 기본 외형을 배정한다: 실무 리드 → 인사 → 임원 */
export const DEFAULT_PANEL = ["daniel", "mei", "tina"] as const;

/** 다음에 말할 면접관. 발언 수를 주 질문자 4 : 나머지 각 3으로 맞추고, 같으면 주 질문자가 먼저 말한다. */
export function nextSpeaker(panel: Interviewer[], transcript: TranscriptEntry[]): Interviewer {
  const lead = panel.find((i) => i.isLead) ?? panel[0];
  const load = (i: Interviewer) =>
    transcript.filter((t) => t.speaker === i.id && t.kind !== "reaction").length / (i === lead ? 4 : 3);
  return panel.reduce((best, i) => (load(i) < load(best) ? i : best), lead);
}

/** 맞장구·대기 연출에 쓰는 짧은 말. 미리 합성해 지연 없이 재생한다. */
export const BACKCHANNELS = ["네.", "네, 알겠습니다.", "음, 그렇군요.", "네, 좋습니다."] as const;
