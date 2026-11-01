import { ButtonLink } from "@/components/ui/button";
import { SiteFooter } from "@/components/ui/site-footer";
import { TopBar } from "@/components/ui/top-bar";
import { PERSONAS } from "@/lib/interviewers";

const PANEL = [
  { p: PERSONAS[1], name: "김서연", role: "인사팀 과장" },
  { p: PERSONAS[0], name: "박도현", role: "개발팀 팀장" },
  { p: PERSONAS[2], name: "이정민", role: "기술본부 상무" },
];

const STEPS = [
  {
    title: "서류를 넣어요",
    body: "채용공고, 자기소개서, 이력서만 있으면 됩니다. 면접 안내 메일이 있다면 함께 넣어 주세요.",
  },
  {
    title: "그 회사 면접장이 차려져요",
    body: "실제 면접 후기에서 면접 형식, 면접관 역할, 분위기, 압박 강도를 찾아 세팅하고, 원하는 대로 고칠 수 있어요.",
  },
  {
    title: "면접을 보고 다시 들어요",
    body: "면접관이 말을 걸고, 꼬리를 물고, 때로는 끊습니다. 끝나면 답변마다 다시 듣고 고칠 점을 확인해요.",
  },
];

export default function Home() {
  return (
    <>
      <TopBar>
        <ButtonLink href="/reviews/new" variant="plain" className="max-sm:hidden">
          면접 후기 남기기
        </ButtonLink>
        <ButtonLink href="/new">시작하기</ButtonLink>
      </TopBar>
      <main id="main">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="rise mx-auto max-w-3xl text-[40px] sm:text-[64px]">그 회사 면접장을, 미리 한 번.</h1>
          <p className="rise mx-auto mt-5 max-w-xl text-[19px] text-ink-2 [animation-delay:80ms] sm:text-[21px]">
            실제 면접 후기로 면접관과 분위기까지 맞춘 다대일 모의 면접. 들어가서 인사하는 순간부터 시작됩니다.
          </p>
          <div className="rise mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:160ms]">
            <ButtonLink href="/new" size="lg">
              면접 준비하기
            </ButtonLink>
          </div>
        </section>

        <section aria-label="면접장 미리보기" className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-[28px] bg-canvas px-4 pb-0 pt-10 sm:px-10 sm:pt-14">
            <div className="mx-auto grid max-w-3xl grid-cols-3 gap-3 sm:gap-6">
              {PANEL.map(({ p, name, role }, i) => (
                <figure key={p.key} className="flex flex-col items-center">
                  <div
                    className="hero-tile aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-white shadow-[var(--shadow-card)]"
                    style={{ animationDelay: `${i * 4}s` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.portrait} alt="" width={600} height={750} className="size-full object-cover" />
                  </div>
                  <figcaption className="relative z-10 -mt-3 rounded-[8px] bg-white px-3 py-1.5 text-center shadow-[0_1px_2px_rgb(0_0_0/8%)] sm:px-4">
                    <span className="block text-[12px] font-semibold sm:text-[14px]">{name}</span>
                    <span className="block text-[11px] text-ink-3 sm:text-[12px]">{role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div aria-hidden className="mx-auto mt-6 h-16 max-w-4xl rounded-t-[20px] bg-white/70 shadow-[inset_0_1px_0_rgb(0_0_0/6%)] sm:h-24" />
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 className="text-[28px] sm:text-[40px]">세 단계면 충분해요.</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-hairline pt-5">
                <span className="tabular text-[15px] font-semibold text-accent">{i + 1}</span>
                <h3 className="mt-2 text-[21px]">{s.title}</h3>
                <p className="mt-2 text-[16px] text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-canvas">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-20 sm:grid-cols-2 sm:px-6 sm:py-24">
            <div>
              <h2 className="text-[28px] sm:text-[36px]">끝나면, 평가지를 받아요.</h2>
              <p className="mt-4 text-[17px] text-ink-2">
                면접관이 빨간 펜으로 동그라미를 친 평가지처럼, 답변마다 잘한 곳과 짚인 곳을 표시해 드려요. 문장을 누르면 그 순간의 내
                목소리를 다시 들을 수 있어요.
              </p>
            </div>
            <figure aria-label="평가지 예시" className="rotate-[-0.6deg] rounded-[6px] bg-white p-6 shadow-[var(--shadow-paper)]">
              <p className="text-[13px] text-ink-3">Q. 성능을 개선했다고 했는데 측정은 어떻게 했나요?</p>
              <p className="mt-3 text-[16px] leading-8">
                저는 API 서버를 맡았고,{" "}
                <span className="relative inline-block">
                  응답 시간을 1.2초에서 0.4초로
                  <svg aria-hidden className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 h-[calc(100%+12px)] w-[calc(100%+16px)]" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <path d="M4 15 C 8 2, 92 0, 96 13 C 99 26, 10 30, 3 17" fill="none" stroke="var(--pen)" strokeWidth="0.9" pathLength={400} className="pen-stroke-view" />
                  </svg>
                </span>{" "}
                줄였습니다. 측정은{" "}
                <span className="underline decoration-pen decoration-wavy decoration-[1.5px] underline-offset-4">열심히</span> 했습니다.
              </p>
              <p className="mt-2 text-right font-pen text-[22px] leading-none text-pen">측정 방법은? 도구·지표</p>
            </figure>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
