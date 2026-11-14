"use client";

import { useEffect, useState } from "react";
import { SignOut, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { TOOLKIT_NAMES, TOOLKITS, type Me, type Toolkit } from "@/lib/types";
import { api, ApiFailure } from "@/components/app/api";
import { Page } from "@/components/app/page-header";
import { useInbox } from "@/components/app/inbox";
import { Button, Chip, Skeleton } from "@/components/ui";

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-b border-line py-7 sm:grid-cols-[200px_1fr] sm:gap-8">
      <h2 className="text-[14px] font-medium text-ink">{title}</h2>
      <div className="min-w-0 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const reportError = (e: unknown) => toast.error(e instanceof ApiFailure ? e.message : "Something went wrong. Try again.");

const WHAT: Record<Toolkit, string> = {
  gmail: "Reads new inbox mail when Sift checks. Sends a reply only when you press Send.",
  outlook: "Reads new inbox mail when Sift checks. Sends a reply only when you press Send.",
  slack: "Reads recent messages you can see when Sift checks. Never posts.",
};

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const work = useInbox();

  useEffect(() => {
    void api<Me>("/api/me").then(setMe).catch(reportError);
  }, []);

  const signOut = async () => {
    await api("/api/signout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  };
  const deleteAll = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "DELETE" });
      window.location.href = "/?deleted=1";
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Page>
      <h1 className="font-serif text-[30px] leading-tight tracking-[-0.015em]">Settings</h1>
      <div className="mt-4">
        <Row title="Account">
          {me ? (
            <p>
              Signed in with publik{me.handle ? <> as <span className="font-medium text-ink">@{me.handle}</span></> : null}.
            </p>
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
          <Button size="sm" variant="secondary" className="mt-4" onClick={() => void signOut()}>
            <SignOut size={15} /> Sign out
          </Button>
        </Row>

        <Row title="Connected accounts">
          <p>Connections go through Composio. Sift only reads when it checks your inbox, and only writes a reply you confirmed.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {TOOLKITS.map((t) => {
              const on = !!work.connections?.connected[t];
              return (
                <li key={t} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{TOOLKIT_NAMES[t]}</span>
                    <span className="block text-[13px]">{WHAT[t]}</span>
                  </span>
                  {on ? <Chip tone="accent">Connected</Chip> : null}
                  {on ? (
                    <Button size="sm" variant="ghost" onClick={() => void work.disconnect(t)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" loading={work.linking === t} disabled={!work.connections?.available || !!work.linking} onClick={() => void work.connect(t)}>
                      Connect
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {work.connections && !work.connections.available ? <p className="mt-3 text-[13px] text-warn">{work.connections.message}</p> : null}
        </Row>

        <Row title="What Sift can and can't do">
          <ul className="list-disc space-y-1 pl-5">
            <li>It reads new messages from the accounts you connect, each time it checks.</li>
            <li>It sends a reply only when you press Send and confirm. It never deletes, archives or changes anything in your accounts. &ldquo;Done&rdquo; only hides a message in Sift.</li>
            <li>Instructions hidden inside a message are treated as text, never as commands.</li>
            <li>Your messages are stored in Sift&rsquo;s database, only for you. Message text goes to the AI only to sort it and write drafts you ask for. AI is paid by Sift, never by you.</li>
          </ul>
        </Row>

        <section className="py-7">
          <h2 className="flex items-center gap-2 text-[15.5px] font-semibold text-danger">
            <Trash size={18} /> Delete everything
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            Permanently removes your messages, drafts and what you taught Sift. This can't be undone.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              aria-label='Type "delete" to confirm'
              placeholder='Type "delete" to confirm'
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              className="h-9 w-56 rounded-lg border border-line-strong bg-surface px-3 text-[14px] focus:border-danger focus:outline-none"
            />
            <Button size="sm" className="bg-danger text-white hover:opacity-90" disabled={confirmDelete.trim().toLowerCase() !== "delete"} loading={busy} onClick={() => void deleteAll()}>
              Delete all my data
            </Button>
          </div>
        </section>
      </div>
    </Page>
  );
}
