import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.DEPLOYMENT_ENV === "PRODUCTION",
  },
};

export default nextConfig;
