/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.output.hashFunction = "xxhash64";
    return config;
  },
  experimental: {
    webpackBuildWorker: false,
  },
};

module.exports = nextConfig;
