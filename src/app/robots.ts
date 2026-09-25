import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://starterchef.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login"],
        // Signed-in app routes have nothing for a crawler to index and would
        // otherwise just hit the auth redirect.
        disallow: [
          "/today",
          "/kitchen",
          "/recipes",
          "/cook",
          "/settings",
          "/sessions",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
