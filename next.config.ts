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
    // Server Actions default to a 1MB request body. generateWavespeed (and the FAL/Replicate/
    // BytePlus equivalents) are called directly as Server Actions with reference images/audio
    // embedded as base64 data URIs, which blows past 1MB for anything but a tiny image — the
    // request never reaches the provider at all when that happens.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig;
