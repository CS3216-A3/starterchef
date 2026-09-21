import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers read prompt files via fs — include /prompts in the
  // serverless bundle so they exist on deploy.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
