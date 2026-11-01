"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileArrowUp, FileText, Sparkle, CaretDown, Check, LinkSimple, Lightbulb } from "@phosphor-icons/react";
import { TopBar } from "@/components/ui/top-bar";
import { Button, Spinner } from "@/components/ui/button";
import { Card, Notice, PageHeader, Segmented } from "@/components/ui/controls";
import { createSession, type CreateStep } from "@/client/api";

const SAMPLE_POSTING = `[네이버] 2026 신입 백엔드 개발자 공개채용 (검색·추천 플랫폼)
- 담당업무: 대규모 검색 트래픽을 처리하는 API 서버 설계·개발, 캐시 계층 최적화, 장애 대응 자동화
- 자격요건: Java/Kotlin 또는 Go 기반 서버 개발 경험, RDBMS 및 Redis 이해, 컴퓨터공학 기초(네트워크·OS·자료구조)
- 우대사항: 대규모 트래픽 부하 테스트 경험, 분산 트랜잭션·메시지 큐(Kafka) 활용 경험
- 전형절차: 서류전형 → 코딩테스트 → 1차 기술면접(실무진 다대일, 45분) → 2차 임원면접`;

const SAMPLE_COVER = `1. 지원동기 및 입사 후 포부
하루 수천만 건의 질의를 흔들림 없이 처리하는 네이버 검색 플랫폼에서 지연 시간 1ms를 줄이는 엔지니어가 되고 싶습니다. 학부 캡스톤에서 캠퍼스 식권 예약 서비스를 운영하며 점심시간 12시 정각에 몰리는 초당 600건의 요청을 다뤄본 경험이 있습니다.

2. 본인이 주도적으로 해결한 가장 어려운 기술적 문제
식권 예약 오픈 직후 DB 커넥션 풀이 고갈되어 응답 시간이 4.2초까지 치솟고 중복 예약이 발생했습니다. 원인을 분석해 보니 재고 차감 쿼리가 비관적 락으로 직렬화되어 있었습니다. 이를 Redis Lua 스크립트 기반 원자적 차감과 Kafka 비동기 영속화 구조로 전환해 평균 응답 시간을 180ms로 단축하고 중복 예약을 0건으로 줄였습니다.

3. 협업 과정에서의 갈등 해결 경험
프론트엔드 팀원과 실시간 잔여 수량 표시 방식을 두고 폴링과 SSE 중 의견이 갈렸습니다. 각 방식의 서버 부하를 k6로 측정한 수치를 공유해 트래픽 대비 구현 복잡도가 낮은 3초 캐시 폴링으로 합의했습니다.`;

const SAMPLE_RESUME = `이름: 김지원
학력: 한국대학교 컴퓨터공학과 졸업예정 (학점 3.9/4.5)
기술스택: Kotlin, Java 21, Spring Boot, MySQL, Redis, Kafka, Docker, k6
프로젝트:
1) 캠퍼스 식권 예약 시스템 (백엔드 리드, 2025.03~2025.11)
   - 동시 접속 1,500명 환경에서 Redis Lua 스크립트로 재고 정합성 확보 (p95 4.2s -> 180ms)
   - HikariCP 커넥션 풀 및 슬로우 쿼리 인덱스 튜닝
2) 오픈소스 분산 스케줄러 컨트리뷰션 (2025.07~2025.09)
   - 타임아웃 재시도 시 지수 백오프 누락 버그 수정 PR 머지`;

const SAMPLE_GUIDE = `[네이버 채용팀] 1차 기술면접 안내
안녕하세요, 김지원 님. 서류 및 코딩테스트 합격을 축하드립니다.
- 전형: 1차 실무 기술면접 (다대일 면접, 면접관 3명 참석 예정)
- 소요시간: 약 40분
- 안내사항: 제출하신 이력서 및 자기소개서 기반의 깊이 있는 기술 검증과 CS 기초 질문이 진행됩니다.`;

type DocKind = "posting" | "coverLetter" | "resume" | "guideEmail" | "review";
type DocMode = "url" | "file" | "text";
type DocInput = { mode: DocMode; url: string; text: string; file: File | null };

const blank = (mode: DocMode): DocInput => ({ mode, url: "", text: "", file: null });
const filled = (d: DocInput) => (d.mode === "file" ? Boolean(d.file) : Boolean((d.mode === "url" ? d.url : d.text).trim()));

const MODES: { value: DocMode; label: string }[] = [
  { value: "file", label: "파일" },
  { value: "text", label: "직접 입력" },
];
const POSTING_MODES: { value: DocMode; label: string }[] = [{ value: "url", label: "URL" }, ...MODES];

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FILE = /\.(pdf|docx|hwp|hwpx|txt|md)$/i;

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function FileDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function take(f: File | undefined) {
    if (!f) return;
    if (!ACCEPTED_FILE.test(f.name)) return setError("PDF, DOCX, HWP 파일만 올릴 수 있습니다.");
    if (f.size > MAX_FILE_BYTES) return setError("8MB 이하 파일만 올릴 수 있습니다.");
    setError(null);
    onFile(f);
  }

  if (file) {
    return (
      <div className="flex h-40 items-center gap-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-5">
        <FileText size={24} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium text-ink" title={file.name}>
            {file.name}
          </p>
          <p className="text-[13px] text-ink-2">{fileSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={() => onFile(null)}
          className="min-h-11 cursor-pointer px-2 text-[14px] font-medium text-accent hover:text-accent-press"
        >
          제거
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed px-4 text-center transition-colors focus-within:border-accent focus-within:bg-accent-soft hover:border-accent ${
          over ? "border-accent bg-accent-soft" : "border-hairline bg-canvas/50"
        }`}
      >
        <FileArrowUp size={24} className={over ? "text-accent" : "text-ink-3"} />
        <span className="text-[16px] font-medium text-ink">파일을 끌어다 놓거나 눌러서 선택하세요</span>
        <span className="text-[13px] text-ink-2">PDF, DOCX, HWP 파일 (8MB 이하)</span>
        <input
          type="file"
          accept=".pdf,.docx,.hwp,.hwpx,.txt,.md"
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type DocFieldProps = {
  label: string;
  hint: string;
  required?: boolean;
  options?: { value: DocMode; label: string }[];
  doc: DocInput;
  onChange: (patch: Partial<DocInput>) => void;
  placeholder: string;
};

function DocField({ label, hint, required, options = MODES, doc, onChange, placeholder }: DocFieldProps) {
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="whitespace-nowrap text-[17px] text-ink">
            {label}
            {required && <span className="ml-1.5 text-[13px] font-normal text-accent">필수</span>}
          </h2>
          <div className="shrink-0">
            <Segmented
              label={`${label} 입력 방식`}
              value={doc.mode}
              onChange={(mode) => onChange({ mode })}
              options={options}
            />
          </div>
        </div>
        <p className="text-[14px] text-ink-2">{hint}</p>
      </div>

      {doc.mode === "url" && (
        <div className="relative flex items-center">
          <LinkSimple size={18} className="pointer-events-none absolute left-4 text-ink-3" />
          <input
            type="url"
            aria-label={`${label} URL`}
            value={doc.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder={placeholder}
            className="field h-12 rounded-[var(--radius-md)] pl-11 pr-4 text-[16px]"
          />
        </div>
      )}
      {doc.mode === "file" && <FileDrop file={doc.file} onFile={(file) => onChange({ file })} />}
      {doc.mode === "text" && (
        <textarea
          aria-label={label}
          value={doc.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={options === POSTING_MODES ? "예) [네이버] 2026 신입 백엔드 개발자 공개채용..." : placeholder}
          className="field block h-40 rounded-[var(--radius-md)] p-4 text-[16px]"
        />
      )}
    </Card>
  );
}

const STEP_LABELS: Record<CreateStep, string> = {
  upload: "제출한 서류를 서버로 전송하고 있습니다",
  parse: "채용공고·자소서·이력서에서 핵심 사실과 수치를 추출하고 있습니다",
  match: "기업·직무 면접 후기 데이터베이스에서 가장 가까운 면접장을 찾고 있습니다",
  setup: "면접관 역할 분담과 질문 설계도를 조립하고 있습니다",
};

const LOADING_TIPS = [
  "첫 문장에 결론을 먼저 말하면(두괄식) 면접관이 핵심을 놓치지 않습니다.",
  "자소서에 적은 수치(예: 응답속도 50% 개선)는 측정 도구와 환경을 함께 답할 준비를 해두세요.",
  "다대일 면접에서는 질문한 면접관을 주로 보되, 마무리할 때 다른 면접관에게도 시선을 나눠주세요.",
  "압박 질문은 공격이 아니라 논리적 근거를 확인하려는 신호입니다. 짧고 침착하게 사실부터 답하세요.",
  "'열심히', '최대한' 같은 모호한 부사 대신 본인이 직접 수행한 행동과 결과 수치를 말씀해 보세요.",
  "모르는 개념이 나오면 아는 척하기보다, 아는 범위까지 솔직히 말하고 유사한 해결 경험을 덧붙이세요.",
  "1분 자기소개는 이력서 요약이 아니라 '이번 직무에서 가장 먼저 꺼내고 싶은 무기 1가지'에 집중하세요.",
];

export default function NewSessionPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Record<DocKind, DocInput>>({
    posting: blank("url"),
    coverLetter: blank("file"),
    resume: blank("file"),
    guideEmail: blank("text"),
    review: blank("text"),
  });
  const [showOptional, setShowOptional] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<CreateStep | null>(null);
  const [matchDetail, setMatchDetail] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    if (!submitting) return;
    const t = setInterval(() => {
      setTipIdx((prev) => (prev + 1) % LOADING_TIPS.length);
    }, 3200);
    return () => clearInterval(t);
  }, [submitting]);

  const canSubmit = filled(docs.posting) && filled(docs.coverLetter) && filled(docs.resume);

  const patchDoc = (kind: DocKind) => (patch: Partial<DocInput>) =>
    setDocs((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));

  function fillSample() {
    setDocs((prev) => ({
      ...prev,
      posting: { ...prev.posting, mode: "text", text: SAMPLE_POSTING },
      coverLetter: { ...prev.coverLetter, mode: "text", text: SAMPLE_COVER },
      resume: { ...prev.resume, mode: "text", text: SAMPLE_RESUME },
      guideEmail: { ...prev.guideEmail, mode: "text", text: SAMPLE_GUIDE },
    }));
    setShowOptional(true);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setStep("upload");
    setMatchDetail(undefined);

    try {
      const fd = new FormData();
      for (const [kind, d] of Object.entries(docs)) {
        if (!filled(d)) continue;
        if (d.mode === "url") fd.set("postingUrl", d.url.trim());
        else if (d.mode === "text") fd.set(kind, d.text);
        else if (d.file) fd.set(`${kind}File`, d.file);
      }

      const id = await createSession(fd, (s, detail) => {
        setStep(s);
        if (detail) setMatchDetail(detail);
      });
      router.push(`/setup/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "면접장을 만드는 중 문제가 발생했습니다");
      setSubmitting(false);
    }
  }

  const stepOrder: CreateStep[] = ["upload", "parse", "match", "setup"];
  const activeStepIdx = step ? stepOrder.indexOf(step) : -1;

  return (
    // 드롭 영역을 벗어나 놓아도 브라우저가 파일을 열어 입력을 날리지 않게 막는다
    <div className="min-h-dvh bg-canvas" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <TopBar
        center={<span className="text-[14px] font-medium text-ink-2">1 / 3 · 서류 제출</span>}
      >
        <Button type="button" variant="secondary" onClick={fillSample} disabled={submitting}>
          <Sparkle size={16} weight="fill" className="text-accent" />
          예시 서류로 채우기
        </Button>
      </TopBar>

      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader title="지원할 회사와 내 서류를 넣어주세요">
          채용공고·자기소개서·이력서를 바탕으로 그 회사의 면접 후기와 대조해 면접관과 질문을 구성합니다.
        </PageHeader>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <DocField
            label="채용공고"
            hint="회사, 직무, 자격요건을 읽어 면접관과 질문을 구성합니다."
            required
            options={POSTING_MODES}
            doc={docs.posting}
            onChange={patchDoc("posting")}
            placeholder="https://www.wanted.co.kr/wd/... 채용공고 주소를 붙여넣어 주세요"
          />

          <DocField
            label="자기소개서"
            hint="답변과 실제 발화가 어긋나는 부분을 짚는 데 쓰입니다."
            required
            doc={docs.coverLetter}
            onChange={patchDoc("coverLetter")}
            placeholder="문항과 작성한 내용을 그대로 붙여넣어 주세요."
          />

          <DocField
            label="이력서 · 경력기술서"
            hint="프로젝트, 기술, 수치 성과가 드러날수록 꼬리질문이 날카로워집니다."
            required
            doc={docs.resume}
            onChange={patchDoc("resume")}
            placeholder="학력, 기술 스택, 프로젝트별 역할과 성과를 적어주세요."
          />

          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-medium text-ink-2 hover:text-ink"
          >
            <CaretDown
              size={16}
              className={`transition-transform duration-300 ease-[var(--ease-spring)] ${showOptional ? "rotate-180" : ""}`}
            />
            선택 서류 더 넣기 (면접 안내 메일, 직접 찾은 면접 후기)
          </button>

          {showOptional && (
            <div className="space-y-4 rise">
              <DocField
                label="면접 안내 메일 · 문자"
                hint="면접 시간, 면접관 수, 진행 방식이 있으면 가장 우선해서 반영합니다."
                doc={docs.guideEmail}
                onChange={patchDoc("guideEmail")}
                placeholder="예) 1차 실무 면접은 40분간 다대일로 진행됩니다..."
              />

              <DocField
                label="직접 찾은 면접 후기"
                hint="블라인드, 잡플래닛 등에서 본 이 회사의 면접 후기를 넣어주세요."
                doc={docs.review}
                onChange={patchDoc("review")}
                placeholder="예) 실무진 두 분이 이력서 프로젝트의 장애 대응 경험을 집요하게 물어봤고..."
              />
            </div>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          {submitting && step && (
            <Card className="rise space-y-4 border border-accent/20 bg-accent-soft/40">
              <p className="text-[17px] font-semibold text-ink">{STEP_LABELS[step]}</p>
              <ol className="space-y-1.5 text-[14px]">
                {stepOrder.map((s, idx) => {
                  const done = idx < activeStepIdx;
                  const current = idx === activeStepIdx;
                  return (
                    <li
                      key={s}
                      className={`flex items-center gap-2 ${
                        done ? "text-positive" : current ? "font-medium text-ink" : "text-ink-3"
                      }`}
                    >
                      <span className="inline-flex size-4 items-center justify-center">
                        {done ? (
                          <Check size={14} weight="bold" />
                        ) : current ? (
                          <Spinner className="size-3 border-[1.5px] text-accent" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-ink-3/50" />
                        )}
                      </span>
                      <span>{STEP_LABELS[s]}</span>
                    </li>
                  );
                })}
              </ol>
              {matchDetail && (
                <p className="text-[13px] text-ink-2">매칭 결과: {matchDetail}</p>
              )}
              <div className="rounded-[var(--radius-md)] bg-white/85 p-4 shadow-[0_1px_3px_rgb(0_0_0/5%)]">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
                  <Lightbulb size={15} weight="fill" />
                  <span>실전 면접 팁 ({tipIdx + 1}/{LOADING_TIPS.length})</span>
                </div>
                <p key={tipIdx} className="rise mt-1 text-[14px] leading-relaxed text-ink">
                  {LOADING_TIPS[tipIdx]}
                </p>
              </div>
            </Card>
          )}

          <div className="flex items-center justify-end gap-3 pt-4">
            <Button type="submit" size="lg" loading={submitting} disabled={!canSubmit || submitting}>
              {submitting ? "면접장 구성 중..." : "면접장 구성하기"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
