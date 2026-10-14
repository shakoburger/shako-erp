import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
      "cloudflare:workers": "./lib/cloudflare-mock.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias["cloudflare:workers"] = path.resolve("./lib/cloudflare-mock.ts");
    return config;
  },
};

export default nextConfig;
