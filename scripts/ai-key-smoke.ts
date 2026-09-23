/**
 * Makes one tiny, billable request to verify the locally configured AI key.
 * It never prints credentials, request URLs, or provider response bodies.
 * Pass --scan to additionally exercise the app's structured vision request
 * with a harmless 1x1 PNG.
 */
import { APICallError } from "ai";
import { deflateSync } from "node:zlib";
import { measuredGenerate, safeAiFailureCode } from "../src/lib/ai/instrument";
import { getModel } from "../src/lib/ai/model";
import { renderPrompt } from "../src/lib/ai/prompts";
import { kitchenScanSchema } from "../src/lib/ai/schemas/kitchen-scan";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI or shells may provide environment variables directly.
}

type Provider = "google" | "google-lite" | "openai";

const provider = (process.env.AI_PROVIDER ?? "google") as Provider;
const model =
  provider === "openai"
    ? (process.env.OPENAI_MODEL ?? "gpt-5.6-luna")
    : provider === "google-lite"
      ? (process.env.GOOGLE_LITE_MODEL ?? "gemini-3.5-flash-lite")
      : (process.env.GOOGLE_MODEL ?? "gemini-5.8-flash");

function statusCode(status: number) {
  if (status === 401 || status === 403) return "AUTH_OR_PERMISSION_FAILED";
  if (status === 404) return "MODEL_NOT_AVAILABLE";
  if (status === 429) return "QUOTA_EXHAUSTED";
  return "PROVIDER_REQUEST_FAILED";
}

function resultFrom(response: Response) {
  return {
    ok: response.ok,
    code: response.ok ? "OK" : statusCode(response.status),
    status: response.status,
  };
}

async function request() {
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, code: "KEY_MISSING" };
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Reply with OK.",
        reasoning: { effort: "none" },
        max_output_tokens: 32,
      }),
    });
    return resultFrom(response);
  }

  if (provider !== "google" && provider !== "google-lite") {
    return { ok: false, code: "UNSUPPORTED_PROVIDER" };
  }
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { ok: false, code: "KEY_MISSING" };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with OK." }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    },
  );
  return resultFrom(response);
}

function errorStatus(error: unknown) {
  return APICallError.isInstance(error) ? error.statusCode : undefined;
}

async function scanProbe() {
  const image = testPng();
  try {
    await measuredGenerate("ai-key-smoke-kitchen-scan", {
      model: getModel("kitchen-scan"),
      schema: kitchenScanSchema,
      temperature: 0.4,
      system: renderPrompt("kitchen-scan", {}),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Identify ingredients in this photo." },
            { type: "file", data: image, mediaType: "image/png" },
          ],
        },
      ],
    });
    return { ok: true, code: "OK" };
  } catch (error) {
    return {
      ok: false,
      code: `VISION_${safeAiFailureCode(error)}`,
      status: errorStatus(error),
    };
  }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

/** A valid 512x512 PNG avoids provider minimum-dimension checks. */
function testPng() {
  const size = 512;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  const row = Buffer.alloc(1 + size * 3);
  row.fill(232, 1); // neutral light-grey pixels
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  try {
    const result = await request();
    console.info(JSON.stringify({ provider, model, ...result }));
    if (!result.ok) {
      process.exitCode = 1;
      return;
    }
    if (process.argv.includes("--scan")) {
      const scan = await scanProbe();
      console.info(
        JSON.stringify({ provider, model, probe: "kitchen-scan", ...scan }),
      );
      if (!scan.ok) process.exitCode = 1;
    }
  } catch {
    console.error(
      JSON.stringify({ provider, model, ok: false, code: "NETWORK_FAILED" }),
    );
    process.exitCode = 1;
  }
}

void main();
