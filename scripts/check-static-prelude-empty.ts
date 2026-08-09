/**
 * CSP nonce gate — prerender された静的シェルに nonce 無し `<script>` を残さない。
 *
 * ## なぜ必要か
 *
 * `src/proxy.ts` の CSP は `script-src 'self' 'nonce-…' 'strict-dynamic'`。
 * CSP3 では `'strict-dynamic'` があると host-source（`'self'` や URL）は**無視される**ため、
 * nonce の付いていない `<script src="/_next/…">` は問答無用でブロックされる。
 *
 * Next.js は **request の `Content-Security-Policy` ヘッダーから nonce を取り出して**
 * script タグに載せる（`app-render` の `getScriptNonceFromHeader`）。したがって
 * ビルド時に prerender された HTML には nonce を付けられない。公式 CSP ガイドも
 * 「nonce を使う場合は全ページを動的レンダリングする必要がある。PPR も
 * *static shell scripts cannot access the nonce* のため nonce ベース CSP と非互換」
 * と明記している。
 *
 * ## 何を検査するか（route 表の ƒ/◐ ではない）
 *
 * build 表の `◐`（Partial Prerender）だけでは違反にならない。本リポジトリは両 root layout で
 * 「`generateViewport` 内 `await connection()` + `<html>` を `<Suspense>` で包む」公式 opt-in を
 * 採っており、prerender された prelude が**空**（`hasHtml:false` / `hasBody:false`、
 * `.next/server/app/**\/*.html` が 0 byte）になる。script は全て **resume 時**に
 * per-request nonce 付きで書き出される（`resumeToFizzStream(…, { nonce })`）。
 *
 * つまり本当の不変条件は「**prerender された HTML に nonce 無し script が無いこと**」。
 * この gate はそれを直接検査する。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_DIR = join(process.cwd(), ".next", "server", "app");

/**
 * 例外。runtime のエラー応答は `app-render` の `ErrorApp` 経路で
 * **request 内**に描画され、`renderToFizzStream(…, { nonce })` で nonce が付く。
 * `_global-error.html` はその静的生成用アーティファクトで、nonce CSP 下の実 request では
 * 配信経路に乗らない。`global-error.tsx` は Next.js の規約上 Client Component 必須で
 * `connection()` による動的化 opt-in を持てないため、ここだけ許容する。
 */
const ALLOWLIST = new Set(["_global-error.html"]);

const SCRIPT_TAG = /<script\b[^>]*>/giu;

interface Violation {
  readonly file: string;
  readonly tags: readonly string[];
}

function listHtmlFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      found.push(full);
    }
  }
  return found;
}

function unnoncedScriptTags(html: string): string[] {
  const tags: string[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const tag = match[0];
    if (!/\snonce\s*=/u.test(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

function main(): void {
  let appDirStat;
  try {
    appDirStat = statSync(APP_DIR);
  } catch {
    throw new Error(
      `${relative(process.cwd(), APP_DIR)} が見つかりません。この gate は \`next build\` の直後に実行してください。`,
    );
  }
  if (!appDirStat.isDirectory()) {
    throw new Error(
      `${relative(process.cwd(), APP_DIR)} がディレクトリではありません。`,
    );
  }

  const violations: Violation[] = [];
  let checked = 0;

  for (const file of listHtmlFiles(APP_DIR)) {
    const rel = relative(APP_DIR, file).split(sep).join("/");
    if (ALLOWLIST.has(rel)) continue;
    checked += 1;

    const html = readFileSync(file, "utf8");
    if (html.length === 0) continue;

    const tags = unnoncedScriptTags(html);
    if (tags.length > 0) {
      violations.push({ file: rel, tags });
    }
  }

  if (violations.length > 0) {
    const detail = violations
      .map(
        ({ file, tags }) =>
          `  - ${file}: nonce 無し script ${String(tags.length)} 本\n      ${tags
            .slice(0, 3)
            .join("\n      ")}`,
      )
      .join("\n");
    throw new Error(
      [
        "prerender された静的シェルに nonce 無しの <script> が含まれています。",
        "strict-dynamic CSP 下では、これらの script は本番でブロックされ、該当ページの JS が一切動きません。",
        "",
        detail,
        "",
        "対処: 該当 route を動的レンダリングに opt-in する（Server Component 冒頭で `await connection()`）。",
        "SSoT: __tests__/unit/architecture/csp-nonce-prelude-gate.test.ts（cacheComponents + strict-dynamic CSP）",
      ].join("\n"),
    );
  }

  console.log(
    `[check-static-prelude-empty] OK — prerender shell ${String(checked)} 件に nonce 無し script なし（allowlist ${String(ALLOWLIST.size)} 件）`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[check-static-prelude-empty] FAIL\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
