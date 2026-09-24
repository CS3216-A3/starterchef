import { describe, expect, it } from "vitest";
import { clientErrorMessage } from "@/lib/client-error";

describe("clientErrorMessage", () => {
  it("reads structured API errors", () => {
    expect(
      clientErrorMessage(
        { error: { code: "INTERNAL_ERROR", message: "Assistant unavailable" } },
        "Fallback",
      ),
    ).toBe("Assistant unavailable");
  });

  it("never displays an arbitrary error object", () => {
    expect(
      clientErrorMessage({ error: { code: "INTERNAL_ERROR" } }, "Fallback"),
    ).toBe("Fallback");
  });
});
