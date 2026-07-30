import type { NextConfig } from "next";

function internalApiDestination(): string {
  const configured =
    process.env.NUVITAE_INTERNAL_API_BASE_URL ?? "http://api:3001";
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid NUVITAE_INTERNAL_API_BASE_URL.");
  }
  return url.toString().replace(/\/$/, "");
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiDestination()}/:path*`,
      },
    ];
  },
};

export default nextConfig;
