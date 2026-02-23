#!/usr/bin/env node
/**
 * fix-web-fonts.js
 *
 * Post-export script that copies font files from the deeply nested
 * dist/assets/node_modules/@expo/vector-icons/... path to a flat
 * dist/fonts/ directory, and updates all HTML @font-face references.
 *
 * Why: Many deployment platforms (Docker registries, PaaS, CDNs) exclude
 * paths containing "node_modules" automatically. The Expo web export places
 * icon fonts inside dist/assets/node_modules/... which causes 404s in
 * production. This script moves them to dist/fonts/ and patches HTML+CSS.
 *
 * Usage: node scripts/fix-web-fonts.js
 * (automatically run as part of `npm run build`)
 */

const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const FONTS_SRC = path.join(
  DIST_DIR,
  "assets",
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "Fonts",
);
const FONTS_DEST = path.join(DIST_DIR, "fonts");

// Old URL prefix (what Expo generates in HTML @font-face and <link preload>)
const OLD_URL_PREFIX =
  "/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/";
const NEW_URL_PREFIX = "/fonts/";

function main() {
  console.log("[fix-web-fonts] Starting font relocation...");

  // 1. Check source exists
  if (!fs.existsSync(FONTS_SRC)) {
    console.warn(`[fix-web-fonts] Source directory not found: ${FONTS_SRC}`);
    console.warn("[fix-web-fonts] Skipping (no fonts to fix).");
    return;
  }

  // 2. Create destination directory
  if (!fs.existsSync(FONTS_DEST)) {
    fs.mkdirSync(FONTS_DEST, { recursive: true });
  }

  // 3. Copy all .ttf files
  const fontFiles = fs.readdirSync(FONTS_SRC).filter((f) => f.endsWith(".ttf"));
  if (fontFiles.length === 0) {
    console.warn("[fix-web-fonts] No .ttf files found in source directory.");
    return;
  }

  for (const file of fontFiles) {
    const src = path.join(FONTS_SRC, file);
    const dest = path.join(FONTS_DEST, file);
    fs.copyFileSync(src, dest);
  }
  console.log(
    `[fix-web-fonts] Copied ${fontFiles.length} font files to dist/fonts/`,
  );

  // 4. Patch all HTML files to replace @font-face URLs
  const htmlFiles = findHtmlFiles(DIST_DIR);
  let patchedCount = 0;
  for (const htmlFile of htmlFiles) {
    let content = fs.readFileSync(htmlFile, "utf-8");
    if (content.includes(OLD_URL_PREFIX)) {
      content = content.split(OLD_URL_PREFIX).join(NEW_URL_PREFIX);
      fs.writeFileSync(htmlFile, content, "utf-8");
      patchedCount++;
    }
  }
  console.log(
    `[fix-web-fonts] Patched ${patchedCount}/${htmlFiles.length} HTML files`,
  );

  console.log("[fix-web-fonts] Done!");
}

/**
 * Recursively find all .html files in a directory.
 */
function findHtmlFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith(".html")) {
      results.push(fullPath);
    }
  }
  return results;
}

main();
