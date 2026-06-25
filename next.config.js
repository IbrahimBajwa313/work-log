const fs = require("fs");
const path = require("path");

let pwaIconRevision = "1";
try {
  const metaPath = path.join(__dirname, "public", "pwa", "asset-meta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  if (meta.iconRevision) pwaIconRevision = meta.iconRevision;
} catch {
  // prebuild may not have run yet in dev
}

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    additionalManifestEntries: [
      { url: "/morning-azkar", revision: "1" },
      { url: "/evening-azkar", revision: "1" },
      { url: "/manifest.webmanifest", revision: pwaIconRevision },
      { url: "/pwa/icon-192.png", revision: pwaIconRevision },
      { url: "/pwa/icon-512.png", revision: pwaIconRevision },
      { url: "/pwa/apple-touch-icon.png", revision: pwaIconRevision },
    ],
    runtimeCaching: [
      {
        urlPattern: /morning-azkar/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "page-morning-azkar",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
        method: "GET",
      },
      {
        urlPattern: /evening-azkar/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "page-evening-azkar",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
        method: "GET",
      },
      {
        urlPattern: /\/pwa\/.*\.(?:png|webp)$/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "pwa-icons",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
        method: "GET",
      },
      {
        urlPattern: /\/manifest\.webmanifest$/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "pwa-manifest",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
        method: "GET",
      },
      {
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
      {
        urlPattern: /\/_next\/image\?url=.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "next-image",
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-images",
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\/api\/work-log.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "work-log-api",
          networkTimeoutSeconds: 8,
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
      {
        urlPattern: /\/api\/auth\/me/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "auth-api",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

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

module.exports = withPWA(nextConfig);
