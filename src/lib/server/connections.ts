import type { Connections } from "@/lib/types";
import { connectorStatus } from "./connector";
import type { Row } from "./db";

const NONE = { gmail: false, outlook: false, slack: false };

/** GET /api/connections. Never throws for an account service that is down or not configured. */
export async function loadConnections(user: Row): Promise<Connections> {
  const r = await connectorStatus(user);
  if (!r.ok) return { available: false, message: r.message, connected: NONE };
  return { available: true, message: null, connected: { ...NONE, ...r.data } };
}
