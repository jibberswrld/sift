import type { Metadata } from "next";
import { TOOLKIT_NAMES, TOOLKITS, type Toolkit } from "@/lib/types";

export const metadata: Metadata = { title: "Connected" };

/** Where an account sign-in lands after connecting (the connector's callbackUrl). */
export default async function Connected({ searchParams }: PageProps<"/connected">) {
  const app = (await searchParams).app;
  const name = TOOLKITS.includes(app as Toolkit) ? TOOLKIT_NAMES[app as Toolkit] : "Your account";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center">
      <div>
        <h1 className="font-serif text-[26px] tracking-[-0.01em] text-ink">{name} is connected.</h1>
        <p className="mt-2 text-[15px] text-muted">You can close this tab and go back to Sift.</p>
      </div>
    </main>
  );
}
