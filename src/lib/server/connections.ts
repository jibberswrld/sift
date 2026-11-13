import type { Connections } from "@/lib/types";
import { connectorStatus } from "./connector";

const NONE = { gmail: false, outlook: false, slack: false };

/** GET /api/connections. Never throws for a connector that is down or not configured. */
export async function loadConnections(): Promise<Connections> {
  const r = await connectorStatus();
  if (!r.ok) return { available: false, message: r.message, connected: NONE };
  return { available: true, message: null, connected: { ...NONE, ...r.data } };
}
