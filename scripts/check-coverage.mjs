/**
 * lcov レポートからライン・カバレッジを解析し、閾値未満なら exit 1 で失敗させる。
 *
 * 使い方:
 *   node scripts/check-coverage.mjs [--threshold 70]
 *
 * bun test --coverage が生成する coverage/lcov.info を読み取る。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_THRESHOLD = 70;

function parseThreshold() {
  const idx = process.argv.indexOf("--threshold");
  if (idx !== -1) {
    const val = Number(process.argv[idx + 1]);
    if (Number.isFinite(val) && val >= 0 && val <= 100) return val;
  }
  return DEFAULT_THRESHOLD;
}

function parseLcov(content) {
  let linesFound = 0;
  let linesHit = 0;

  for (const line of content.split("\n")) {
    if (line.startsWith("LF:")) {
      linesFound += Number(line.slice(3));
    } else if (line.startsWith("LH:")) {
      linesHit += Number(line.slice(3));
    }
  }

  return { linesFound, linesHit };
}

const threshold = parseThreshold();
const lcovPath = join(process.cwd(), "coverage", "lcov.info");

let content;
try {
  content = readFileSync(lcovPath, "utf-8");
} catch {
  console.error(`❌ Coverage report not found: ${lcovPath}`);
  console.error("   Run 'bun test --coverage' first.");
  process.exit(1);
}

const { linesFound, linesHit } = parseLcov(content);

if (linesFound === 0) {
  console.error("❌ No lines found in coverage report.");
  process.exit(1);
}

const coverage = (linesHit / linesFound) * 100;
const rounded = Math.round(coverage * 100) / 100;

console.log(`\nLine coverage: ${rounded}% (${linesHit}/${linesFound})`);
console.log(`Threshold:     ${threshold}%`);

if (coverage < threshold) {
  console.error(`\n❌ Coverage ${rounded}% is below threshold ${threshold}%`);
  process.exit(1);
}

console.log(`\n✅ Coverage meets threshold.`);
