import { ALLOWED_TOOLS, connectionStatus, connectorCaller, connectorSession, notConnected, slimEmails, slimOutlook, upstream } from "@/lib/server/composio";
import { handle, HttpError, json, readJson } from "@/lib/server/http";

export const maxDuration = 60;

/** Connector service: run ONE allowlisted tool for the caller. Everything else is refused. */
export const POST = handle(async (req: Request) => {
  const body = (await readJson(req)) as { tool?: unknown; arguments?: unknown };
  const tool = typeof body.tool === "string" ? body.tool : "";
  const toolkit = Object.hasOwn(ALLOWED_TOOLS, tool) ? ALLOWED_TOOLS[tool] : null;
  await connectorCaller(req);
  if (!toolkit) throw new HttpError(403, "tool_not_allowed", "Sift can't do that."); // refused before Composio is ever called
  const { session } = await connectorSession(req);
  const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? (body.arguments as Record<string, unknown>) : {};
  try {
    if (!(await connectionStatus(session))[toolkit]) {
      throw notConnected(toolkit);
    }
    // Always the caller's own mailbox, whatever the request says.
    const result = await session.execute(tool, toolkit === "slack" ? args : { ...args, user_id: "me" });
    if (result.resultType !== "completed") {
      console.error("[connector]", tool, result.resultType, result.error);
      throw new HttpError(502, "tool_failed", "Your account couldn't complete that. Please try again.");
    }
    const data = tool === "GMAIL_FETCH_EMAILS" ? slimEmails(result.data) : tool === "OUTLOOK_LIST_MESSAGES" ? slimOutlook(result.data) : result.data;
    return json({ data });
  } catch (e) {
    throw upstream(e);
  }
});
