import { runInContext, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { workflowErrorChain, workflowErrorMessage } from "@/lib/workflow-error";

describe("workflowErrorMessage", () => {
  it("reads messages from errors created in another realm", () => {
    const hostError = new Error("Recipe source could not be read");
    const sandbox = createContext({ hostError });
    // What the workflow sandbox sees: instanceof fails across realms.
    expect(runInContext("hostError instanceof Error", sandbox)).toBe(false);
    expect(workflowErrorMessage(hostError)).toBe(
      "Recipe source could not be read",
    );
  });

  it("accepts strings and falls back for unusable values", () => {
    expect(workflowErrorMessage("boom")).toBe("boom");
    expect(workflowErrorMessage(null)).toBe("Workflow failed");
    expect(workflowErrorMessage({ message: "" })).toBe("Workflow failed");
    expect(workflowErrorMessage({ message: 42 }, "x")).toBe("x");
  });
});

describe("workflowErrorChain", () => {
  it("unwraps the cause behind a generic fetch failure", () => {
    const cause = Object.assign(new Error("connect ECONNRESET 1.2.3.4:443"), {
      code: "ECONNRESET",
    });
    const error = new TypeError("fetch failed", { cause });
    expect(workflowErrorChain(error)).toBe(
      "fetch failed <- ECONNRESET connect ECONNRESET 1.2.3.4:443",
    );
  });

  it("stops at plain errors and falls back on unusable values", () => {
    expect(workflowErrorChain(new Error("Could not fetch (403)"))).toBe(
      "Could not fetch (403)",
    );
    expect(workflowErrorChain(null)).toBe("Workflow failed");
    expect(workflowErrorChain(undefined, "unknown")).toBe("unknown");
  });
});
