import type { ReactNode } from "react";

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full px-4 py-7 sm:px-8 sm:py-9 ${wide ? "max-w-[1180px]" : "max-w-[760px]"}`}>{children}</main>;
}
