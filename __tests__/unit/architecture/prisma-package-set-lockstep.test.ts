import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Prisma パッケージ群を 1 つの版に固定する gate。
 *
 * ## なぜ
 *
 * `prisma` / `@prisma/client` / `@prisma/adapter-pg` は 1 つの monorepo から
 * **同じ版数で同時に publish される**。adapter は `@prisma/driver-adapter-utils`
 * を**完全一致で**依存し（`"@prisma/driver-adapter-utils": "7.9.1"` のように
 * range ではなく固定値）、client 側の runtime とその protocol で会話する。
 * 版がずれた組み合わせは Prisma が publish していない組み合わせであり、
 * どの peerDependencies にも書かれていないので **npm も bun も警告しない**。
 *
 * ## 実際に起きたこと
 *
 * `.github/renovate.json5` は Prisma パッケージを `groupName: "prisma"` で
 * 束ねているが、以前は後段の "Database drivers require manual review" が
 * `@prisma/adapter-pg` にだけ `minimumReleaseAge: "7 days"` を足していた。
 * Renovate の release age 判定は **package 単位**で、若すぎる更新はその branch から
 * 外れる。結果 group は名前だけになり `prisma` / `@prisma/client` だけが上がった
 * PR が出る。2026-08-25 の 7.10.0 で実際にそうなった（PR の更新表に
 * `@prisma/adapter-pg` の行が無い）。マージしていれば client 7.10.0 +
 * adapter 7.9.1 で本番が動いていた。
 *
 * ## 何を見るか
 *
 * `package.json` の宣言 range と `bun.lock` の解決版の**両方**。宣言だけ見ると
 * `^7.9.1` は 7.10.0 を含むので、lock が 7.9.1 に据え置かれた skew を見逃す。
 *
 * ## 直し方
 *
 * 3 つとも同じ版へ上げる。片方だけ上げたい理由ができたなら、それは
 * この docstring を書き換える PR で説明すること（skew を黙って通す入口は作らない）。
 */

const ROOT = process.cwd();

/**
 * 版を揃えることが求められる Prisma パッケージ。`@prisma/dev` は prisma CLI の
 * 推移的依存で独自の 0.x 系を持つため含めない（Renovate の group には入る）。
 */
const PRISMA_PACKAGE_SET = [
  "prisma",
  "@prisma/client",
  "@prisma/adapter-pg",
] as const;

type VersionsByPackage = Readonly<Record<string, string>>;

/**
 * 版が 1 つに揃っていない package 名を返す（揃っていれば空配列）。
 * 純関数なので、下の fixture が「落ちるべき形 / 落ちてはいけない形」を直接当てられる。
 */
export function findVersionSkew(
  versions: VersionsByPackage,
): readonly string[] {
  const skew: string[] = [];
  let reference: string | undefined;
  for (const [name, version] of Object.entries(versions)) {
    if (reference === undefined) {
      reference = version;
      continue;
    }
    if (version !== reference) skew.push(name);
  }
  return skew;
}

const packageJson = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const lockSource = readFileSync(join(ROOT, "bun.lock"), "utf8");

/** `package.json` が宣言している range。宣言が無い package は落として返す。 */
function readDeclaredRanges(): Record<string, string> {
  const declared: Record<string, string> = {};
  for (const name of PRISMA_PACKAGE_SET) {
    const range =
      packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
    if (typeof range === "string") declared[name] = range;
  }
  return declared;
}

/**
 * bun.lock の解決エントリ（`    "name": ["name@1.2.3", ...`）から版を読む。
 * 入れ子の dependencies 文字列を拾わないよう、行頭 4 スペースの key 行に限定する。
 */
function readResolvedVersions(): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const name of PRISMA_PACKAGE_SET) {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);
    const pattern = new RegExp(
      String.raw`^ {4}"${escaped}": \["${escaped}@([^"]+)"`,
      "mu",
    );
    const version = pattern.exec(lockSource)?.[1];
    if (typeof version === "string") resolved[name] = version;
  }
  return resolved;
}

describe("prisma package set stays on one version", () => {
  test("package.json declares every package of the set", () => {
    const declared = readDeclaredRanges();
    // 走査規模の下限。名前が変わって 0 件になったまま緑になるのを防ぐ。
    expect(Object.keys(declared)).toHaveLength(3);
    expect(Object.keys(declared).toSorted()).toEqual([
      "@prisma/adapter-pg",
      "@prisma/client",
      "prisma",
    ]);
  });

  test("declared ranges are identical across the set", () => {
    const declared = readDeclaredRanges();
    expect(Object.keys(declared)).toHaveLength(3);
    expect(findVersionSkew(declared)).toEqual([]);
  });

  test("bun.lock resolves the set to one concrete version", () => {
    const resolved = readResolvedVersions();
    // lock の書式が変わって全件読めなくなったら、skew 検査ではなくここで落ちる
    // （`toEqual([])` が空振りで緑になるのを防ぐ）。
    expect(Object.keys(resolved)).toHaveLength(3);
    expect(findVersionSkew(resolved)).toEqual([]);
  });

  // ---- 判定の見本 --------------------------------------------------------
  //
  // 「落ちてはいけない形」はツリーの実物（上の 3 テスト）が担う。
  // 「落ちるべき形」はツリーに実例が 0 件なので合成する。値は 2026-08-25 に
  // Renovate が実際に作った組み合わせそのもの。

  test("detects the client/adapter skew that a split Renovate group produces", () => {
    expect(
      findVersionSkew({
        prisma: "7.10.0",
        "@prisma/client": "7.10.0",
        "@prisma/adapter-pg": "7.9.1",
      }),
    ).toEqual(["@prisma/adapter-pg"]);
  });

  test("accepts a set that moved together", () => {
    expect(
      findVersionSkew({
        prisma: "7.10.0",
        "@prisma/client": "7.10.0",
        "@prisma/adapter-pg": "7.10.0",
      }),
    ).toEqual([]);
  });
});
