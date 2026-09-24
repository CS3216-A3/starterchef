import { runInContext, createContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { workflowErrorMessage } from "@/lib/workflow-error";

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
