/**
 * Syncs PWA icons from app/icon.png into public/pwa and regenerates manifest
 * with a content hash so browsers pick up icon updates after deploy.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const iconSrc = path.join(root, "app", "icon.png");
const appleSrc = path.join(root, "app", "apple-icon.png");
const outDir = path.join(root, "public", "pwa");

if (!fs.existsSync(iconSrc)) {
  console.error("sync-pwa-assets: missing app/icon.png");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const iconBuf = fs.readFileSync(iconSrc);
const appleBuf = fs.existsSync(appleSrc) ? fs.readFileSync(appleSrc) : iconBuf;

fs.writeFileSync(path.join(outDir, "icon-192.png"), iconBuf);
fs.writeFileSync(path.join(outDir, "icon-512.png"), iconBuf);
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), appleBuf);

const iconRevision = crypto.createHash("md5").update(iconBuf).digest("hex").slice(0, 12);

const manifest = {
  name: "Work Logging",
  short_name: "Work Log",
  description:
    "Track working hours, daily tasks, Deen and fitness goals, and morning & evening Azkar.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#000000",
  theme_color: "#00ffcc",
  categories: ["productivity", "lifestyle"],
  icons: [
    {
      src: "/pwa/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/pwa/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/pwa/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    {
      name: "Today's log",
      short_name: "Today",
      url: "/",
      icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Morning Azkar",
      short_name: "Morning",
      url: "/morning-azkar",
      icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Evening Azkar",
      short_name: "Evening",
      url: "/evening-azkar",
      icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
  ],
};

fs.writeFileSync(
  path.join(root, "public", "manifest.webmanifest"),
  JSON.stringify(manifest, null, 2) + "\n"
);

fs.writeFileSync(
  path.join(outDir, "asset-meta.json"),
  JSON.stringify({ iconRevision }, null, 2) + "\n"
);

// Remove legacy icon copies that may still be served on some hosts.
const stalePaths = [
  path.join(root, "public", "icon.png"),
  path.join(root, "public", "apple-touch-icon.png"),
  path.join(root, "public", "icons", "icon-192.png"),
  path.join(root, "public", "icons", "icon-512.png"),
];
for (const p of stalePaths) {
  try {
    fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

console.log(`sync-pwa-assets: icons updated (revision ${iconRevision})`);
