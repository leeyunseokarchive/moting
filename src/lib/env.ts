import "server-only";

/** 서버 전용 환경 변수 접근. 값이 비어 있으면 해당 기능은 데모 대체로 동작한다. */
export const env = {
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  deepgramKey: process.env.DEEPGRAM_API_KEY ?? "",
  simliKey: process.env.SIMLI_API_KEY ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  forceDemo: process.env.MOTING_FORCE_DEMO === "1",
  models: {
    smart: process.env.GEMINI_MODEL_SMART ?? "gemini-3.8-flash",
    fast: process.env.GEMINI_MODEL_FAST ?? "gemini-3.5-flash-lite",
    tts: process.env.GEMINI_MODEL_TTS ?? "gemini-3.8-flash-lite-tts",
    embed: process.env.GEMINI_MODEL_EMBED ?? "gemini-embedding-001",
  },
};

export type Providers = {
  llm: boolean;
  tts: boolean;
  stt: boolean;
  avatar: boolean;
  storage: "supabase" | "file";
};

export function providers(): Providers {
  const on = (v: string) => !env.forceDemo && v.length > 0;
  return {
    llm: on(env.geminiKey),
    tts: on(env.geminiKey),
    stt: on(env.deepgramKey),
    avatar: on(env.simliKey),
    storage: env.supabaseUrl && env.supabaseServiceKey ? "supabase" : "file",
  };
}
