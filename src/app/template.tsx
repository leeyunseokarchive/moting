import { ViewTransition, type ReactNode } from "react";

/** 레이아웃은 이동해도 유지되어 전환이 일어나지 않으므로 페이지마다 새로 만들어지는 template에 둔다 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
