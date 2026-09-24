import { describe, expect, it } from "vitest";
import { apiErrorMessage, cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
    expect(cn("text-espresso", false && "hidden")).toBe("text-espresso");
  });
});

describe("apiErrorMessage", () => {
  it("reads the apiError {error:{message}} shape", () => {
    const body = { error: { code: "RATE_LIMITED", message: "Out of credits" } };
    expect(apiErrorMessage(body, "fallback")).toBe("Out of credits");
  });

  it("reads a plain string error", () => {
    expect(apiErrorMessage({ error: "Nope" }, "fallback")).toBe("Nope");
  });

  it("falls back on missing or malformed errors", () => {
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage({ error: {} }, "fallback")).toBe("fallback");
  });
});
