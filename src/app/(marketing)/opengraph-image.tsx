import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "StarterChef — Your start to great cooking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const nunito = await readFile(
  join(process.cwd(), "src/app/fonts/Nunito-Static-700.ttf"),
);
const logo = await readFile(join(process.cwd(), "public/logo.png"));
const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "#FAF7F2",
        fontFamily: "Nunito",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={60} height={60} />
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 800,
            color: "#493326",
          }}
        >
          StarterChef
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 58,
            fontWeight: 800,
            color: "#493326",
            lineHeight: 1.15,
            maxWidth: 980,
          }}
        >
          Your start to&nbsp;
          <span style={{ color: "#A34405" }}>great cooking.</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#8A6F5C",
            maxWidth: 820,
            lineHeight: 1.4,
          }}
        >
          StarterChef sees what&apos;s in your kitchen, suggests meals you can
          actually make, and talks you through every step.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {["Scan your kitchen", "Recipes that fit you", "Cook step by step"].map(
          (t) => (
            <div
              key={t}
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 999,
                background: "#F3E5D2",
                color: "#493326",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {t}
            </div>
          ),
        )}
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Nunito", data: nunito, style: "normal", weight: 700 }],
    },
  );
}
