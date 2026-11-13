"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Bucket, Connections, Inbox, Message, SyncEvent, Toolkit } from "@/lib/types";
import { TOOLKIT_NAMES } from "@/lib/types";
import { api, ApiFailure } from "./api";

const RESYNC_AFTER_MS = 5 * 60_000;

interface Sync {
  running: "sync" | "resort" | null;
  step: string | null; // what Sift is doing right now
  error: { message: string; topUpUrl: string | null } | null;
}

interface InboxState {
  messages: Message[] | null;
  loadError: string | null;
  lastSyncAt: string | null;
  connections: Connections | null;
  linking: Toolkit | null;
  sync: Sync;
  selectedId: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<void>;
  runSync: () => Promise<void>;
  runResort: () => Promise<void>;
  move: (id: string, bucket: Bucket, note?: string | null) => Promise<void>;
  setDone: (id: string, done: boolean) => Promise<void>;
  update: (m: Message) => void;
  connect: (t: Toolkit) => Promise<void>;
  disconnect: (t: Toolkit) => Promise<void>;
}

const Ctx = createContext<InboxState | null>(null);
export function useInbox() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInbox outside provider");
  return v;
}

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

async function readStream(path: string, onEvent: (e: SyncEvent) => void) {
  const res = await fetch(path, { method: "POST", headers: { "x-timezone": tz() } });
  if (!res.ok || !res.body) {
    const b = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string; topUpUrl?: string } } | null;
    throw new ApiFailure(res.status, b?.error?.code ?? "error", b?.error?.message ?? "Couldn't reach your inbox.", b?.error?.topUpUrl ?? null);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as SyncEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as SyncEvent);
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [linking, setLinking] = useState<Toolkit | null>(null);
  const [sync, setSync] = useState<Sync>({ running: null, step: null, error: null });
  const [selectedId, select] = useState<string | null>(null);
  const busy = useRef(false);
  const lastSyncRef = useRef<number>(0);

  const merge = useCallback((incoming: Message[]) => {
    setMessages((cur) => {
      const byId = new Map((cur ?? []).map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].filter((m) => !m.done).sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt));
    });
  }, []);
  const update = useCallback((m: Message) => merge([m]), [merge]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<Inbox>("/api/inbox");
      setMessages(r.messages);
      setLastSyncAt(r.lastSyncAt);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiFailure ? e.message : "Your inbox couldn't be loaded.");
    }
  }, []);

  const refreshConnections = useCallback(async () => {
    try {
      const c = await api<Connections>("/api/connections");
      setConnections(c);
      return c;
    } catch {
      const c: Connections = { available: false, message: "Your accounts can't be reached right now.", connected: { gmail: false, outlook: false, slack: false } };
      setConnections(c);
      return c;
    }
  }, []);

  const stream = useCallback(
    async (kind: "sync" | "resort") => {
      if (busy.current) return;
      busy.current = true;
      setSync({ running: kind, step: kind === "sync" ? "Checking your accounts" : "Sorting again", error: null });
      let error: Sync["error"] = null;
      try {
        await readStream(`/api/inbox/${kind}`, (e) => {
          if (e.type === "step") setSync((s) => ({ ...s, step: e.text }));
          else if (e.type === "sorted") merge(e.messages);
          else if (e.type === "error") error = { message: e.message, topUpUrl: e.topUpUrl ?? null };
        });
        if (kind === "sync") lastSyncRef.current = Date.now();
        await Promise.all([refresh(), refreshConnections()]); // fetched messages the sorter didn't reach; accounts may have changed
      } catch (e) {
        error = { message: e instanceof ApiFailure ? e.message : "Couldn't reach your inbox. Try again.", topUpUrl: e instanceof ApiFailure ? e.topUpUrl : null };
      } finally {
        busy.current = false;
        setSync({ running: null, step: null, error });
      }
    },
    [merge, refresh, refreshConnections],
  );
  const runSync = useCallback(() => stream("sync"), [stream]);
  const runResort = useCallback(() => stream("resort"), [stream]);

  // Opening the app is the trigger: load what's stored, then pull and sort what's new.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.all([refresh(), refreshConnections()]);
      if (alive) await runSync();
    })();
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSyncRef.current > RESYNC_AFTER_MS) void runSync();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, refreshConnections, runSync]);

  const move = useCallback(
    async (id: string, bucket: Bucket, note?: string | null) => {
      const prev = messages?.find((m) => m.id === id);
      if (prev) update({ ...prev, bucket, movedByYou: true });
      try {
        update(await api<Message>(`/api/messages/${id}`, { method: "POST", json: { bucket, note: note ?? null } }));
      } catch (e) {
        if (prev) update(prev);
        toast.error(e instanceof ApiFailure ? e.message : "Couldn't move that message.");
      }
    },
    [messages, update],
  );

  const setDone = useCallback(
    async (id: string, done: boolean) => {
      const prev = messages?.find((m) => m.id === id);
      if (done) setMessages((cur) => cur?.filter((m) => m.id !== id) ?? null);
      if (done && selectedId === id) select(null);
      try {
        const m = await api<Message>(`/api/messages/${id}`, { method: "POST", json: { done } });
        if (!done) update(m);
        else
          toast("Marked done", {
            action: { label: "Undo", onClick: () => void api<Message>(`/api/messages/${id}`, { method: "POST", json: { done: false } }).then(update).catch(() => {}) },
          });
      } catch (e) {
        if (prev) update(prev);
        toast.error(e instanceof ApiFailure ? e.message : "Couldn't update that message.");
      }
    },
    [messages, selectedId, update],
  );

  const connect = useCallback(
    async (t: Toolkit) => {
      // Open the tab inside the click so browsers don't block it, then point it at the sign-in page.
      const tab = window.open("about:blank", "_blank");
      try {
        const { url } = await api<{ url: string }>("/api/connections/link", { method: "POST", json: { toolkit: t } });
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        toast.error(e instanceof ApiFailure ? e.message : `Couldn't connect ${TOOLKIT_NAMES[t]}.`);
        return;
      }
      setLinking(t);
      const until = Date.now() + 5 * 60_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2500));
        const c = await refreshConnections();
        if (c.connected[t]) {
          setLinking(null);
          toast.success(`${TOOLKIT_NAMES[t]} is connected`);
          void runSync();
          return;
        }
      }
      setLinking(null);
    },
    [refreshConnections, runSync],
  );

  const disconnect = useCallback(async (t: Toolkit) => {
    try {
      setConnections(await api<Connections>("/api/connections/disconnect", { method: "POST", json: { toolkit: t } }));
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : `Couldn't disconnect ${TOOLKIT_NAMES[t]}.`);
    }
  }, []);

  const value = useMemo<InboxState>(
    () => ({ messages, loadError, lastSyncAt, connections, linking, sync, selectedId, select, refresh, runSync, runResort, move, setDone, update, connect, disconnect }),
    [messages, loadError, lastSyncAt, connections, linking, sync, selectedId, refresh, runSync, runResort, move, setDone, update, connect, disconnect],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
