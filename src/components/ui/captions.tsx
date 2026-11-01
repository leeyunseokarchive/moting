"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const LINE_CHARS = 36;
const MS_PER_CHAR = 95; // 음성보다 살짝 앞서게 잡는다. 말이 끝나면 남은 줄은 바로 나온다
const LEAVE_MS = 260; // globals.css의 caption-leave와 맞춘다
const WORD_STAGGER_MS = 55;

/** 문장 단위로 먼저 끊고, 긴 문장은 어절 단위로 고르게 나눈다 */
export function captionLines(text: string, max = LINE_CHARS): string[] {
  return text
    .trim()
    .split(/(?<=[.?!…])\s+/)
    .filter(Boolean)
    .flatMap((sentence) => {
      const width = sentence.length / Math.ceil(sentence.length / max);
      const lines: string[] = [];
      let line = "";
      for (const word of sentence.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && (line.length >= width || next.length > max)) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
      return lines;
    });
}

function Word({ text, delay }: { text: string; delay: number }) {
  const [start] = useState(delay); // 다음 단어가 와도 진행 중인 등장이 튀지 않게 처음 값을 유지한다
  return (
    <span className="caption-word" style={{ animationDelay: `${start}ms` }}>
      {text}{" "}
    </span>
  );
}

/** 질문이 바뀌면 질문과 답변을 함께 내보낸 뒤 새 질문을 한 줄씩 쌓는다 */
export function Captions({ question, answer, speaking }: { question: string; answer: string; speaking: boolean }) {
  const [shown, setShown] = useState({ question: "", answer: "" });
  const leaving = shown.question !== question;
  if (!leaving && shown.answer !== answer) setShown({ question, answer });

  // 애니메이션 이벤트에 맡기면 CSS가 적용되지 않았을 때 자막이 영영 멈춘다
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setShown({ question, answer: "" }), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, question]);

  const words = shown.answer ? shown.answer.split(/\s+/) : [];
  const [seen, setSeen] = useState(0);
  useEffect(() => setSeen(words.length), [words.length]);

  // 넘친 만큼만 위로 민다. 레이아웃 대신 transform을 써서 줄이 바뀌어도 끊기지 않는다
  const stream = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!stream.current || !flow.current) return;
    const overflow = Math.max(0, flow.current.offsetHeight - stream.current.clientHeight);
    flow.current.style.transform = `translateY(${-overflow}px)`;
    stream.current.dataset.full = String(overflow > 0);
  }, [shown]);

  // 가운데 정렬이라 단어가 붙으면 앞 단어가 밀린다. 순간 이동 대신 새 자리로 미끄러지게 한다
  const answerBox = useRef<HTMLDivElement>(null);
  const placed = useRef<{ left: number; top: number }[]>([]);
  useLayoutEffect(() => {
    const els = [...(answerBox.current?.children ?? [])] as HTMLElement[];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    els.forEach((el, i) => {
      const before = placed.current[i];
      if (still || !before || before.top !== el.offsetTop || before.left === el.offsetLeft) return;
      // composite add: 앞선 이동이 끝나기 전에 다음 단어가 와도 위치가 튀지 않는다
      el.animate(
        { transform: [`translateX(${before.left - el.offsetLeft}px)`, "translateX(0)"] },
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)", composite: "add" },
      );
    });
    placed.current = els.map((el) => ({ left: el.offsetLeft, top: el.offsetTop }));
  }, [shown.answer]);

  let chars = 0;
  return (
    <div ref={stream} className={`caption-stream mx-auto w-full max-w-[680px] ${leaving ? "caption-leave" : ""}`}>
      <div ref={flow} key={shown.question} className="caption-flow">
        <div
          className={`text-[17px] font-medium leading-normal transition-opacity duration-300 sm:text-[19px] ${
            words.length ? "opacity-60" : ""
          }`}
        >
          {captionLines(shown.question).map((line, i) => {
            const delay = chars * MS_PER_CHAR;
            chars += line.length;
            return (
              <span key={i} className="caption-line" style={speaking ? { animationDelay: `${delay}ms` } : undefined}>
                {line}
              </span>
            );
          })}
        </div>
        {words.length > 0 && (
          <div ref={answerBox} className="caption-answer text-[16px] leading-relaxed sm:text-[17px]">
            {words.map((word, i) => (
              <Word key={i} text={word} delay={Math.max(0, Math.min(i - seen, 10)) * WORD_STAGGER_MS} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
