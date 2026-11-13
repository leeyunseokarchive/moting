import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://moting-roan.vercel.app")
  ),
  title: {
    default: "Moting (모팅) — AI 다대일 실시간 모의면접",
    template: "%s · Moting",
  },
  description:
    "채용공고와 자기소개서를 넣으면 실제 면접 후기 기반 면접관 패널, 분위기, 꼬리질문까지 맞춤 구성하는 실전 AI 모의면접 플랫폼",
  keywords: [
    "Moting",
    "모팅",
    "AI 모의면접",
    "실시간 모의면접",
    "면접 준비",
    "취업 준비",
    "AI 면접관",
    "면접 기출",
    "꼬리질문",
    "면접 피드백",
  ],
  authors: [{ name: "Moting" }],
  creator: "Moting",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "Moting (모팅)",
    title: "Moting (모팅) — 그 회사 면접장을, 미리 한 번",
    description:
      "실제 기출 후기 기반 맞춤 면접관 패널, WebRTC 실시간 립싱크 대화, 단어 단위 음성 첨삭 리포트를 제공하는 실전 AI 모의면접 플랫폼",
    images: [
      {
        url: "/og-image.png?v=4",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Moting — AI 다대일 실시간 모의면접",
      },
      {
        url: "/og-image.jpg?v=4",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Moting — AI 다대일 실시간 모의면접",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Moting (모팅) — 그 회사 면접장을, 미리 한 번",
    description:
      "실제 기출 후기 기반 맞춤 면접관 패널, WebRTC 실시간 립싱크 대화, 단어 단위 음성 첨삭 리포트를 제공하는 실전 AI 모의면접 플랫폼",
    images: ["/og-image.png?v=4"],
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
