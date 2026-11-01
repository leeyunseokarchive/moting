import { TopBar } from "@/components/ui/top-bar";
import { Card } from "@/components/ui/controls";

const MIT_NOTICE = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const MIT_SOURCES = [
  ["https://github.com/jbee37142/Interview_Question_for_Beginner", "Copyright (c) 2017 Jbee"],
  ["https://github.com/gyoogle/tech-interview-for-developer", "Copyright (c) 2019 Gyuseok Kim"],
  ["https://github.com/WooVictory/Ready-For-Tech-Interview", "Copyright (c) 2020 이승우"],
  ["https://github.com/boost-devs/ai-tech-interview", "Copyright (c) 2021 boost-devs"],
  ["https://github.com/zzsza/Datascience-Interview-Questions", "Copyright (c) 2018 Seong Yun Byeon"],
  ["https://github.com/smee6/Frontend_Jr_Interview", "Copyright (c) 2022 Seo Myung In"],
  ["https://github.com/iStudyiOS/iOS_iAmReadyForInterview", "Copyright (c) 2022 I Study iOS"],
  ["https://github.com/devSquad-study/2023-CS-Study", "Copyright (c) 2023 Junyong Moon"],
  ["https://github.com/rheehot/Android-Interview-QnA-2020", "Copyright (c) 2020 SungBin"],
  ["https://github.com/trevi00/to-senior-study", "Copyright (c) 2026 trevi00"],
  ["https://github.com/JerryK026/random-interview-defense", "Copyright (c) 2023 SeokyungKim"],
];

const OTHER_SOURCES = [
  ["murjune/android-interview, Licensed under the Apache License, Version 2.0, 질문 문장으로 변환함", "https://github.com/murjune/android-interview"],
  ["GimunLee/tech-refrigerator, Licensed under the Apache License, Version 2.0, 질문 문장으로 변환함", "https://github.com/GimunLee/tech-refrigerator"],
  ["백엔드 개발자 면접 가이드(zeikar), CC BY 4.0, 문서 제목을 면접 질문 문장으로 변경함", "https://github.com/zeikar/backend-interview-guide"],
];

export const metadata = { title: "오픈소스·데이터 출처 | Moting" };

export default function CreditsPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar />
      <main id="main" className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <h1 className="text-[28px] sm:text-[34px]">오픈소스·데이터 출처</h1>
          <p className="mt-2 text-[16px] text-ink-2">
            직무 기본 질문은 아래 공개 자료에서 가져와 말투를 다듬어 씁니다. 실제 기업 면접에서 나온 질문이라는 뜻은 아닙니다.
          </p>
        </div>

        <Card className="space-y-4">
          <h2 className="text-[17px] text-ink">Apache License 2.0, CC BY 4.0</h2>
          <ul className="space-y-2 text-[14px] text-ink-2">
            {OTHER_SOURCES.map(([label, url]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-ink-2">
            <a href="/licenses/apache-2.0.txt" className="underline">
              Apache License 2.0 전문
            </a>
            {", "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline">
              CC BY 4.0 전문
            </a>
          </p>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-[17px] text-ink">MIT License</h2>
          <ul className="space-y-2 text-[14px] text-ink-2">
            {MIT_SOURCES.map(([url, copyright]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {url.replace("https://github.com/", "")}
                </a>
                <span className="block text-[13px] text-ink-3">{copyright}</span>
              </li>
            ))}
          </ul>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-canvas p-4 text-[13px] text-ink-2">{MIT_NOTICE}</pre>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-[17px] text-ink">면접 후기</h2>
          <p className="text-[14px] text-ink-2">잡코리아와 velog에 공개된 후기의 형식·질문 유형·분위기를 요약해 면접 구성에 참고합니다. 원문은 저장하지 않습니다.</p>
        </Card>
      </main>
    </div>
  );
}
