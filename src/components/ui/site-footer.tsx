import Link from "next/link";
import type { QuestionPlanItem } from "@/lib/types";

/** 공용 푸터. credits를 주면 질문 은행 출처를 저장소별로 한 번씩 적는다. */
export function SiteFooter({ credits = [], className = "max-w-5xl" }: { credits?: QuestionPlanItem["credit"][]; className?: string }) {
  const sources = new Map(
    credits.flatMap((c) => (c?.url ? [[new URL(c.url).pathname.split("/").slice(1, 3).join("/"), c] as const] : [])),
  );
  return (
    <footer className={`mx-auto px-4 py-10 text-[13px] text-ink-3 sm:px-6 ${className}`}>
      <p>Moting · 심화프로젝트랩. 면접관 얼굴은 AI 아바타이며 실제 인물이 아닙니다.</p>
      {sources.size > 0 && (
        <p className="mt-1">
          직무 기본 질문 출처:{" "}
          {[...sources].map(([repo, c], i) => (
            <span key={repo}>
              {i > 0 && ", "}
              <a href={c.url ?? undefined} target="_blank" rel="noreferrer" className="underline">
                {repo}
              </a>{" "}
              ({c.license})
            </span>
          ))}
        </p>
      )}
      <Link href="/credits" className="mt-1 inline-block underline">
        오픈소스·데이터 출처
      </Link>
    </footer>
  );
}
