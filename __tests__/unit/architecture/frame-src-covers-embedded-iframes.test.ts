/**
 * **framing するホストは、必ず CSP `frame-src` に載っていなければならない。**
 *
 * ## なぜ
 *
 * 監査 A-44: `LEXICAL_ALLOWED_IFRAME_HOSTNAMES`（sanitize が通す iframe host）と
 * `CONTENT_EMBED_FRAME_ORIGINS`（CSP `frame-src` の実体）が別々の手書きリストで、
 * `platform.twitter.com` は前者にだけあった。結果として **X 埋め込みは
 * 保存も表示も成功するのに、ブラウザが必ず `Refused to frame` でブロックする**。
 * 管理画面プレビューも同じ CSP なので、編集者は原因に気づけない。
 *
 * リストが片方だけ増える形は静かに壊れる（保存時も表示時もエラーにならない）ので、
 * 検査を置かないと次も同じことが起きる。この不変条件を見るテストは 0 本だった。
 *
 * ## 何を見るか
 *
 * 1. `LEXICAL_ALLOWED_IFRAME_HOSTNAMES` ⊆ `FRAME_SRC_DIRECTIVE_VALUES` の host 集合。
 *    現在の実装は前者を後者から導出しているので構造的に真だが、
 *    **手書きの別リストへ戻した瞬間に落ちる**のがこのテストの役目。
 * 2. `src/**` のソースが実際に literal で framing している host も同じ集合に載ること。
 *    こちらが A-44 の実際の形（`XNode.tsx` が `platform.twitter.com` を直書きしている
 *    のに CSP のリストに無い）を再現する。
 *
 * 2 の走査は **JSX の `<iframe … src=…>` と `createElement("iframe")` +
 * `setAttribute("src", …)` の 2 形だけ**を見る粗い静的検査で、
 * 変数に入った URL は追えない。`<script src>` を拾わないために `iframe` の綴りを
 * 必須にしてあり、走査前に空白を潰すので prettier の改行位置には依存しない。
 *
 * ## 直し方
 *
 * 埋め込み先を増やすときは `CONTENT_EMBED_FRAME_ORIGINS` に origin を 1 行足す。
 * sanitize 側の allowlist はそこから導出されるので、両方を触る必要はない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";
import {
  CONTENT_EMBED_FRAME_ORIGINS,
  FRAME_SRC_DIRECTIVE_VALUES,
} from "@/shared/lib/constants/frame-sources";
import { LEXICAL_ALLOWED_IFRAME_HOSTNAMES } from "@/shared/lib/html/lexical-html-sanitize-config";

/** JSX の `<iframe … src={`https://host/…`}>`（属性の順序は問わない）。 */
const JSX_IFRAME_SRC =
  /<iframe\b[^>]{0,600}?\bsrc=\{?["'`]https:\/\/([a-zA-Z0-9.-]+)/gu;

/** `createElement("iframe")` した要素へ `setAttribute("src", …)` する形。 */
const DOM_IFRAME_SRC =
  /createElement\(\s*"iframe"\s*\)[\s\S]{0,400}?setAttribute\(\s*"src"\s*,\s*["'`]https:\/\/([a-zA-Z0-9.-]+)/gu;

/**
 * CSP `frame-src` の値から host 集合を作る。
 * `'self'` のようなキーワード値は host を持たないので落とす。
 */
function frameSrcHostnames(values: readonly string[]): Set<string> {
  const hostnames = new Set<string>();
  for (const value of values) {
    if (!value.startsWith("https://")) continue;
    hostnames.add(new URL(value).hostname);
  }
  return hostnames;
}

/** ソース 1 本が literal で framing している host。 */
function framedHostnames(source: string): string[] {
  // prettier の改行位置に依存しないよう、走査前に空白を 1 つへ潰す。
  const flattened = source.replace(/\s+/gu, " ");
  return [JSX_IFRAME_SRC, DOM_IFRAME_SRC].flatMap((pattern) =>
    [...flattened.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

describe("framing するホストは CSP frame-src に載っている", () => {
  test("sanitize が通す iframe host は frame-src の部分集合", () => {
    const allowed = frameSrcHostnames(FRAME_SRC_DIRECTIVE_VALUES);

    expect(LEXICAL_ALLOWED_IFRAME_HOSTNAMES.length).toBeGreaterThan(5);
    expect(
      LEXICAL_ALLOWED_IFRAME_HOSTNAMES.filter(
        (hostname) => !allowed.has(hostname),
      ),
    ).toEqual([]);
  });

  test("ソースが literal で framing している host も frame-src に載っている", () => {
    const files = collectSourceFiles(join(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(2000);

    const allowed = frameSrcHostnames(FRAME_SRC_DIRECTIVE_VALUES);
    const violations = files.flatMap((file) =>
      framedHostnames(readFileSync(file, "utf8"))
        .filter((hostname) => !allowed.has(hostname))
        .map((hostname) => `${file}: ${hostname}`),
    );

    expect(violations).toEqual([]);
  });

  test("走査が実際に埋め込み host を拾えている", () => {
    const files = collectSourceFiles(join(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(2000);

    const framed = new Set(
      files.flatMap((file) => framedHostnames(readFileSync(file, "utf8"))),
    );

    // 走査が 0 件でも上の test は緑になるため、実在する埋め込みを名指しで押さえる。
    expect([...framed].sort()).toEqual([
      "platform.twitter.com",
      "player.vimeo.com",
      "www.instagram.com",
      "www.youtube.com",
    ]);
  });

  test("突合ロジックが差分を検出する（見本）", () => {
    // 落ちるべき形: A-44 そのもの。sanitize は X を通すが CSP に無い。
    const beforeFix = frameSrcHostnames([
      "'self'",
      "https://www.youtube.com",
      "https://player.vimeo.com",
    ]);
    expect(
      ["www.youtube.com", "platform.twitter.com"].filter(
        (hostname) => !beforeFix.has(hostname),
      ),
    ).toEqual(["platform.twitter.com"]);

    // 落ちてはいけない形: origin を足せば host も揃う。
    const afterFix = frameSrcHostnames([
      "'self'",
      "https://www.youtube.com",
      "https://player.vimeo.com",
      "https://platform.twitter.com",
    ]);
    expect(
      ["www.youtube.com", "platform.twitter.com"].filter(
        (hostname) => !afterFix.has(hostname),
      ),
    ).toEqual([]);

    // 走査側の見本: `<script src>` は拾わない / 属性順は問わない / 改行に依存しない。
    expect(
      framedHostnames('<script src="https://www.clarity.ms/tag/x" />'),
    ).toEqual([]);
    expect(
      framedHostnames(
        '<iframe\n  title="t"\n  src={`https://player.vimeo.com/video/${id}`}\n/>',
      ),
    ).toEqual(["player.vimeo.com"]);
    expect(
      framedHostnames(
        'const iframe = document.createElement("iframe");\niframe.setAttribute(\n  "src",\n  `https://platform.twitter.com/embed/Tweet.html?id=${id}`,\n);',
      ),
    ).toEqual(["platform.twitter.com"]);
  });

  test("CONTENT_EMBED_FRAME_ORIGINS が frame-src へ実際に流れている", () => {
    // 導出元を差し替えられたら気づけるように、両端を突き合わせる。
    expect(CONTENT_EMBED_FRAME_ORIGINS.length).toBeGreaterThan(5);
    expect(
      CONTENT_EMBED_FRAME_ORIGINS.filter(
        (origin) => !FRAME_SRC_DIRECTIVE_VALUES.includes(origin),
      ),
    ).toEqual([]);
  });
});
