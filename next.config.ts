import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cursor / browser preview proxies hitting the cloud agent host.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
