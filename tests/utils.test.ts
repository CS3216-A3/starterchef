import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
    expect(cn("text-espresso", false && "hidden")).toBe("text-espresso");
  });
});
