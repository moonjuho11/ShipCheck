// Run the scanner on a local folder and print the report.
//   npm run scan:local -- ./path/to/app [https://live-site.example]
import { runScan } from "../src/scanner";

async function main() {
  const [dir, siteUrl] = process.argv.slice(2);
  if (!dir) { console.error("usage: npm run scan:local -- <folder> [site-url]"); process.exit(1); }
  const res = await runScan({
    source: { kind: "local", path: dir }, siteUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY, model: process.env.SEAPROOF_MODEL || undefined,
    onProgress: (steps) => { const s = steps.find((x) => x.status === "running"); if (s) process.stderr.write(`… ${s.label}\n`); },
  });
  console.log(`\nScore: ${res.score}/100  ${res.productionReady ? "✅ Production Ready" : "❌ Not production ready"}`);
  console.log(`Critical ${res.counts.critical} · High ${res.counts.high} · Medium ${res.counts.medium} · Low ${res.counts.low}\n`);
  for (const f of res.findings) console.log(`[${f.severity.toUpperCase()}] ${f.title}${f.file ? `  (${f.file}${f.line ? `:${f.line}` : ""})` : ""}  {${f.ruleId}/${f.source}}`);
  console.log("\nTools:", res.meta.tools, res.meta.notes.length ? `\nNotes: ${res.meta.notes.join(" | ")}` : "");
}
main().catch((e) => { console.error(e); process.exit(1); });
