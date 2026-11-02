// Regenerates src/app/icon.svg and docs/brand/*.svg from src/components/Logo.tsx.
//   npx tsx scripts/export-brand.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { logoSvg } from "../src/components/Logo";

mkdirSync("docs/brand", { recursive: true });
writeFileSync("docs/brand/logo-white.svg", logoSvg("#ededed") + "\n");
writeFileSync("docs/brand/logo-black.svg", logoSvg("#000000") + "\n");
// App icon: mark at 60% on the brand background.
writeFileSync("docs/brand/app-icon.svg",
  logoSvg("#ededed").replace('viewBox="0 0 32 32">', 'viewBox="0 0 32 32"><rect width="32" height="32" fill="#000000"/><g transform="translate(6.4 6.4) scale(.6)">').replace("</svg>", "</g></svg>") + "\n");
// Favicon adapts to light/dark browser chrome.
writeFileSync("src/app/icon.svg",
  logoSvg("currentColor", "<style>svg{color:#000000}@media (prefers-color-scheme:dark){svg{color:#ededed}}</style>") + "\n");
console.log("brand assets written");
