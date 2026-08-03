import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (bonus item) — traces only the deps each
  // route actually needs into .next/standalone instead of shipping full node_modules.
  output: "standalone",
};

export default nextConfig;
