import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers read prompt files via fs — include /prompts in the
  // serverless bundle so they exist on deploy.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Imported recipes carry image URLs from arbitrary source sites.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
