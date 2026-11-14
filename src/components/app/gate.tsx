"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { GateInfo } from "@/lib/types";
import { Wordmark } from "../brand";
import { Button, Skeleton } from "../ui";
import { api, ApiFailure } from "./api";

const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60_000;

/** Sign in with publik. Nothing in the app renders until the gate says "ready". AI is on the house (the developer's credits). */
export function Gate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<GateInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollStart = useRef(0);

  const load = useCallback(async () => {
    try {
      const g = await api<GateInfo>("/api/gate");
      setGate(g);
      return g;
    } catch (e) {
      const body = e instanceof ApiFailure ? e.message : "publik is not reachable. Check your connection.";
      setGate({ state: "unreachable", title: "Sign in with publik", body, note: null, claimUrl: null, handle: null });
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the await
    void load();
  }, [load]);

  // Poll GET /api/gate every 3 s for at most 10 minutes while the person signs in in the other tab.
  useEffect(() => {
    if (!polling) return;
    pollStart.current = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - pollStart.current > POLL_LIMIT_MS) {
        setPolling(false);
        setNote("No sign-in after 10 minutes. Click Sign in with publik to try again.");
        return;
      }
      const g = await load();
      if (g && g.state !== "sign_in") {
        setPolling(false);
        setNote(null);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [polling, load]);

  if (gate?.state === "ready") return <>{children}</>;

  const signIn = () => {
    if (!gate?.claimUrl) return;
    window.open(gate.claimUrl, "_blank", "noopener");
    setNote("Waiting for you to sign in in the other tab.");
    setPolling(true);
  };

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 py-6 sm:px-10">
      <Wordmark />
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-16">
        {!gate ? (
          <div className="space-y-4" aria-label="Loading">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-8 h-11 w-full" />
          </div>
        ) : gate.state === "not_configured" ? (
          <Panel title="Sift isn't set up yet" body={gate.body} />
        ) : gate.state === "unreachable" ? (
          <Panel title={gate.title} body={gate.body}>
            <Button variant="primary" size="lg" className="w-full" onClick={() => { setNote(null); void load(); }}>
              Retry
            </Button>
          </Panel>
        ) : (
          <Panel title="Every inbox, sorted by what needs you." body="Gmail, Outlook and Slack in one list. Sift reads what's new, puts what needs you first, and learns what matters to you. Free to use: sign in with publik to start.">
            <Button variant="primary" size="lg" className="w-full" onClick={signIn} disabled={!gate.claimUrl}>
              Sign in with publik
              <ArrowSquareOut size={16} />
            </Button>
            {note ? (
              <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-ink-2">
                {polling ? <span className="size-1.5 animate-pulse rounded-full bg-accent-text" aria-hidden /> : null}
                {note}
              </p>
            ) : null}
          </Panel>
        )}
      </div>
    </main>
  );
}

function Panel({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-[34px] font-normal leading-[1.12] tracking-[-0.015em] text-ink">{title}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{body}</p>
      {children ? <div className="mt-9">{children}</div> : null}
    </div>
  );
}
