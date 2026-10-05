import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/*": [
      ".env.local",
      ".env*.local",
      "last-recipe*",
      "var/**/*",
    ],
  },
};

export default nextConfig;
