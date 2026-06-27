/**
 * curation icon の SVG markup 静的マップを生成する（Next バンドル外）。
 *
 * Usage: bun scripts/generate-curated-icon-svg-markup.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getCuratedIconComponent } from "../src/shared/components/icon-curation/component-map";

const ICON_CLASS_BY_CONTEXT = {
  inline: "inline-icon-svg",
  feature: "feature-icon-svg",
  button: undefined,
} as const;

function renderIconMarkup(name: string, className: string | undefined): string {
  const Icon = getCuratedIconComponent(name);
  if (!Icon) return "";
  return renderToStaticMarkup(
    createElement(Icon, {
      ...(className !== undefined && { className }),
      "aria-hidden": true,
    }),
  );
}

const names = new Set<string>();
// component-map のキーを列挙するため、既知の curation 名を icon picker SSoT から import
import { ICON_CATEGORIES } from "../src/shared/lib/icon-curation";

for (const category of ICON_CATEGORIES) {
  for (const icon of category.icons) {
    names.add(icon.name);
  }
}

const entries: string[] = [];
for (const name of [...names].sort()) {
  const markup = renderIconMarkup(name, ICON_CLASS_BY_CONTEXT.inline);
  if (markup === "") continue;
  entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(markup)},`);
}

const outputPath = join(
  process.cwd(),
  "src/shared/lib/html/curated-icon-svg-markup.ts",
);

const contents = `/**
 * AUTO-GENERATED — \`bun scripts/generate-curated-icon-svg-markup.ts\`
 *
 * Tabler curated icon の SVG markup（server enrich 用。React DOM render は Next バンドル外で生成）。
 */

export const CURATED_ICON_SVG_MARKUP = {
${entries.join("\n")}
} as const satisfies Record<string, string>;

export function getCuratedIconSvgMarkup(name: string): string | undefined {
  return (CURATED_ICON_SVG_MARKUP as Record<string, string>)[name];
}
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, contents, "utf8");
console.log(`Wrote ${entries.length} icons to ${outputPath}`);
