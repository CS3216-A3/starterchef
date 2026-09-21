import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Prompts live as versioned files in /prompts (they're cited in the
 * assignment writeup — treat changes like code changes). `{{var}}`
 * placeholders are interpolated by renderPrompt().
 */

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  const text = readFileSync(file, "utf8");
  cache.set(name, text);
  return text;
}

export function renderPrompt(
  name: string,
  vars: Record<string, string>,
): string {
  return loadPrompt(name).replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => vars[key] ?? match,
  );
}
