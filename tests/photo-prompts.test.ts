import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function prompt(name: string) {
  return readFileSync(
    path.join(process.cwd(), "prompts", `${name}.md`),
    "utf8",
  );
}

describe("photo recipe prompt contracts", () => {
  it("routes cards and finished dishes without treating images as instructions", () => {
    expect(prompt("photo-source-classify")).toContain("recipe_card");
    expect(prompt("photo-source-classify")).toContain("finished_dish");
    expect(prompt("photo-source-classify")).toContain(
      "untrusted source content",
    );
  });

  it("produces complete recipes and labels inferred details", () => {
    expect(prompt("photo-card-complete")).toContain("assumptions");
    expect(prompt("photo-dish-generate")).toContain("approximation");
    expect(prompt("photo-dish-generate")).toContain("74°C / 165°F");
  });

  it("keeps repairable critical omissions in the revision path", () => {
    expect(prompt("recipe-verify")).toContain("Use `revise`");
    expect(prompt("recipe-verify")).toContain("Use `block` only");
    expect(prompt("recipe-adjudicate")).toContain("not automatically a block");
  });
});
