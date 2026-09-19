import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fal.media',
        pathname: '/files/**',
      },
    ],
  },
  experimental: {
    // Server Actions default to a 1MB request body. generateVenice is called directly as a
    // Server Action with reference images embedded as base64 data URIs, which blows past 1MB
    // for anything but a tiny image — the request never reaches Venice at all when that happens.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig;
