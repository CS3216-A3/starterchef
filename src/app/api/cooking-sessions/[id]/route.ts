import { ownedSession, sessionIdFromPath } from "@/lib/cooking-session-api";
import { withProtectedRoute } from "@/lib/protected-route";

/** Small owner-checked heartbeat for live media and stale-tab detection. */
export const GET = withProtectedRoute(async (context) => {
  const known = await ownedSession(context, sessionIdFromPath(context.request));
  if (known.error) return known.error;
  return Response.json({
    status: known.data.status,
    version: known.data.version,
  });
});
