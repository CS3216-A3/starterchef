import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleted: false,
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: mocks.remove }) },
    from: (table: string) => {
      let action = "read";
      const query = {
        select: () => query,
        lt: () => query,
        lte: () => query,
        eq: () => query,
        limit: () => query,
        update: () => {
          action = "update";
          return query;
        },
        delete: () => {
          action = "delete";
          return query;
        },
        then: (resolve: (value: unknown) => void) => {
          if (table === "kitchen_scans" && action === "read")
            resolve({
              data: mocks.deleted
                ? []
                : [
                    {
                      id: "scan",
                      user_id: "2fd58ee4-8868-4b78-8337-b3aa93da3dd9",
                      object_path:
                        "2fd58ee4-8868-4b78-8337-b3aa93da3dd9/7f6a849c-a905-4c5a-aeae-e5f768ea6426",
                    },
                  ],
              error: null,
            });
          else if (table === "kitchen_scans" && action === "delete") {
            mocks.deleted = true;
            resolve({ error: null });
          } else resolve({ data: [], error: null });
        },
      };
      return query;
    },
  }),
}));

import { GET, validRetentionPath } from "@/app/api/cron/retention/route";

describe("retention retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleted = false;
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  it("retains expired metadata on Storage failure and deletes it on retry", async () => {
    mocks.remove
      .mockResolvedValueOnce({ error: { message: "unavailable" } })
      .mockResolvedValueOnce({ error: null });
    const request = () =>
      new Request("http://localhost/api/cron/retention", {
        headers: { authorization: "Bearer test-cron-secret" },
      });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.deleted).toBe(false);
    expect((await GET(request())).status).toBe(200);
    expect(mocks.deleted).toBe(true);
  });

  it("rejects paths outside the owner scope", () => {
    const owner = "2fd58ee4-8868-4b78-8337-b3aa93da3dd9";
    expect(
      validRetentionPath(
        "scan",
        owner,
        `${owner}/7f6a849c-a905-4c5a-aeae-e5f768ea6426`,
      ),
    ).toBe(true);
    expect(
      validRetentionPath(
        "scan",
        owner,
        `other/7f6a849c-a905-4c5a-aeae-e5f768ea6426`,
      ),
    ).toBe(false);
    expect(
      validRetentionPath("event", owner, `${owner}/recipes/active.jpg`),
    ).toBe(false);
  });
});
