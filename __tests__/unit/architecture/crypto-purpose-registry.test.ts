/**
 * crypto.ts の HKDF purpose 文字列がリポジトリ全体で重複していないことを機械強制する。
 *
 * purpose が衝突しても `decrypt()` 自体は暗号文自身の purpose に従うため壊れないが
 * （[[project_crypto-token-purpose-cross-use]]）、同一の派生鍵を意図せず共有することになり、
 * 呼び出し側が purpose 一致を明示検証していない箇所では目的外 ciphertext の誤受理に
 * つながりうる。
 *
 * ## 列挙を手書きにしない（監査 A-60）
 *
 * 以前は非 Settings の purpose を `OTHER_DOMAIN_PURPOSES` として**手書きで列挙**していた。
 * これは 2 度 drift している:
 *
 * - Phase C 監査 — `marketing-unsubscribe` / `event-registration-payment` /
 *   `receipt-download` の 3 件が列挙漏れ（当時のコメントが記録している）
 * - 監査 A-60 — `form-render`（`tokens/form-render-token.ts`）が列挙漏れ
 *
 * docstring は「新しい purpose を追加する際は本テストが重複を機械的に検出する」と
 * 主張していたが、**列挙が手書きである以上その主張は成立しない**。列挙自体を
 * AST で集めることで drift の入口を消す。
 *
 * ## callee 名で絞らない
 *
 * 最初は `encrypt(` / `decrypt(` の呼び出しだけを見ていたが、それだと
 * `safeDecryptToString` / `safeEncrypt` / `safeDecrypt` 経由が落ちる
 * （実際 `domain/instagram/queries.ts` の `"instagram"` が漏れていた）。
 * 走査根は「`@/shared/lib/crypto` を import しているファイル」で、その中の
 * `purpose` / `expectedPurpose` プロパティをすべて拾う。crypto を import しない
 * ファイル（PWA manifest の `purpose: "maskable"` 等）は構造的に対象外になる。
 *
 * ## 未解決を黙って落とさない
 *
 * 解決できない purpose 式が 1 つでもあれば**その時点で落とす**。「読めなかったので
 * 集合から外す」は、この gate が防ごうとしている空振りそのものになる。
 *
 * ## 粗さ
 *
 * 解決するのは (1) 文字列リテラル (2) 同一ファイル top-level の `const` 束縛
 * (3) `SETTINGS_CRYPTO_PURPOSES` のプロパティ参照 (4) alias import 1 ホップ
 * （`PASSCODE_CRYPTO_PURPOSE` が実在する形）の 4 形。計算で作る purpose は
 * `purposeFor(kind)`（カレンダー）の 1 系統しかなく、こちらは callee 名の一致まで見て
 * 展開値を明示する。5 形目が要るようになったら、その場で解決規則を足すこと
 * （未解決は落ちるので、黙って通ることはない）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, test, expect } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isNamedImports,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableStatement,
  type Expression,
  type Node,
  type SourceFile,
} from "typescript";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  purposeFor,
  type CalendarTokenKind,
} from "@/shared/lib/calendar/calendar-token";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");

/** crypto API に渡る purpose を持つ引数キー。 */
const PURPOSE_KEYS = new Set(["purpose", "expectedPurpose"]);

/**
 * purpose を受け取る API を所有する module。
 *
 * **callee 名で絞らない。** `encrypt` / `decrypt` だけを見ると
 * `safeDecryptToString` / `safeEncrypt` / `safeDecrypt` 経由の呼び出しを取りこぼす
 * （実際 `domain/instagram/queries.ts` の `"instagram"` がそれで漏れていた）。
 * この module を import しているファイルの中の `purpose` / `expectedPurpose` を
 * すべて拾う。crypto を import しないファイル（PWA manifest の
 * `purpose: "maskable"` 等）は構造的に対象外になる。
 */
const CRYPTO_MODULE_SPECIFIER = "@/shared/lib/crypto";

/** `purposeFor(kind)` の kind は型でしか宣言されていないので、ここで展開値を固定する。 */
const CALENDAR_TOKEN_KINDS: readonly CalendarTokenKind[] = [
  "reservation",
  "event",
];

const SETTINGS_REGISTRY_IDENTIFIER = "SETTINGS_CRYPTO_PURPOSES";

/**
 * `crypto.ts` の既定 purpose。呼び出し側で省略されたときに使われるので
 * `encrypt(...)` の引数としては現れない。
 */
function readDefaultPurpose(): string {
  const source = readFileSync(
    join(SRC_ROOT, "shared", "lib", "crypto.ts"),
    "utf8",
  );
  const value = /const DEFAULT_PURPOSE = "([^"]+)";/u.exec(source)?.[1];
  if (!value) throw new Error("crypto.ts の DEFAULT_PURPOSE が読めない");
  return value;
}

type PurposeRef =
  | { readonly kind: "literal"; readonly value: string; readonly file: string }
  | { readonly kind: "settings"; readonly key: string; readonly file: string }
  | {
      readonly kind: "computed";
      readonly callee: string;
      readonly file: string;
    }
  | {
      readonly kind: "unresolved";
      readonly text: string;
      readonly file: string;
    };

/** `as const` などのラッパを剥がす。 */
function unwrap(node: Expression): Expression {
  return isAsExpression(node) ? unwrap(node.expression) : node;
}

/** ファイル top-level の `const` 束縛を集める。 */
function topLevelConsts(source: SourceFile): Map<string, Expression> {
  const out = new Map<string, Expression>();
  forEachChild(source, (node) => {
    if (!isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (isIdentifier(decl.name) && decl.initializer) {
        out.set(decl.name.text, unwrap(decl.initializer));
      }
    }
  });
  return out;
}

/** named import された識別子 → import 元の module specifier。 */
function namedImportSources(source: SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  forEachChild(source, (node) => {
    if (!isImportDeclaration(node) || !isStringLiteral(node.moduleSpecifier)) {
      return;
    }
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !isNamedImports(bindings)) return;
    for (const element of bindings.elements) {
      out.set(element.name.text, node.moduleSpecifier.text);
    }
  });
  return out;
}

/** `@/shared/...` 等の alias を実ファイルへ落とす（`tsconfig.json` の paths と同じ 5 本）。 */
function resolveModuleFile(specifier: string): string | null {
  const prefixes: readonly (readonly [string, readonly string[]])[] = [
    ["@/shared/", ["src", "shared"]],
    ["@/admin/", ["src", "app", "(admin)", "admin", "(dashboard)", "_shared"]],
    ["@/public/", ["src", "app", "(public)", "_shared"]],
    ["@/", ["src"]],
  ];
  for (const [prefix, segments] of prefixes) {
    if (!specifier.startsWith(prefix)) continue;
    const rest = specifier.slice(prefix.length).split("/");
    const candidate = join(ROOT, ...segments, ...rest) + ".ts";
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

/**
 * 別 module から import された purpose 定数を 1 ホップだけ辿る。
 *
 * `smart-lock/customer-passcode-queries.ts` が `issue-passcode.ts` の
 * `PASSCODE_CRYPTO_PURPOSE` を import している形が実在する。辿らないと
 * 「解決できない」で落ちてしまい、gate が運用不能になる。
 */
function importedStringConst(
  specifier: string,
  name: string,
): { readonly expression: Expression; readonly file: string } | null {
  const file = resolveModuleFile(specifier);
  if (!file) return null;
  const source = createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ScriptTarget.Latest,
    true,
  );
  const expression = topLevelConsts(source).get(name);
  if (!expression) return null;
  return { expression, file: file.replace(ROOT, "").replaceAll("\\", "/") };
}

function resolve(
  node: Expression,
  consts: Map<string, Expression>,
  imports: Map<string, string>,
  file: string,
  depth = 0,
): PurposeRef {
  const value = unwrap(node);

  if (isStringLiteral(value)) {
    return { kind: "literal", value: value.text, file };
  }
  if (
    isPropertyAccessExpression(value) &&
    isIdentifier(value.expression) &&
    value.expression.text === SETTINGS_REGISTRY_IDENTIFIER
  ) {
    return { kind: "settings", key: value.name.text, file };
  }
  if (isIdentifier(value) && depth < 3) {
    const local = consts.get(value.text);
    if (local) return resolve(local, consts, imports, file, depth + 1);

    const specifier = imports.get(value.text);
    if (specifier) {
      const imported = importedStringConst(specifier, value.text);
      if (imported) {
        // 宣言元のファイルを引き継ぐ。参照元を記録すると
        // 「1 purpose = 1 宣言箱所」の判定が意味をなさなくなる。
        return resolve(
          imported.expression,
          new Map(),
          new Map(),
          imported.file,
          depth + 1,
        );
      }
    }
  }
  if (isCallExpression(value) && isIdentifier(value.expression)) {
    return { kind: "computed", callee: value.expression.text, file };
  }
  return { kind: "unresolved", text: value.getText(), file };
}

/** crypto module を import しているファイルの、purpose 系プロパティを集める。 */
function collectPurposeRefs(): PurposeRef[] {
  const refs: PurposeRef[] = [];

  for (const file of collectSourceFiles(SRC_ROOT)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(`from "${CRYPTO_MODULE_SPECIFIER}"`)) continue;

    const source = createSourceFile(
      file,
      text,
      ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
    );
    const consts = topLevelConsts(source);
    const imports = namedImportSources(source);
    const relative = file.replace(ROOT, "").replaceAll("\\", "/");

    const visit = (node: Node): void => {
      if (isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (
            !isPropertyAssignment(property) ||
            !isIdentifier(property.name) ||
            !PURPOSE_KEYS.has(property.name.text)
          ) {
            continue;
          }
          refs.push(resolve(property.initializer, consts, imports, relative));
        }
      }
      forEachChild(node, visit);
    };
    forEachChild(source, visit);
  }

  return refs;
}

describe("crypto purpose registry", () => {
  const refs = collectPurposeRefs();
  const literals = [
    ...new Set(refs.flatMap((r) => (r.kind === "literal" ? [r.value] : []))),
  ];

  test("走査が空振りしていない", () => {
    // 0 件だと以下の重複検査は必ず緑になる。
    expect(refs.length).toBeGreaterThan(20);
    expect(literals.length).toBeGreaterThan(10);
  });

  test("解決できない purpose 式が残っていない", () => {
    // 「読めなかったので集合から外す」を許すと、この gate は静かに空振りする。
    expect(
      refs.flatMap((r) =>
        r.kind === "unresolved" ? [`${r.file}: ${r.text}`] : [],
      ),
    ).toEqual([]);
  });

  test("計算で作る purpose は purposeFor の 1 系統だけ", () => {
    const callees = [
      ...new Set(
        refs.flatMap((r) => (r.kind === "computed" ? [r.callee] : [])),
      ),
    ];
    expect(callees).toEqual(["purposeFor"]);
  });

  test("SETTINGS_CRYPTO_PURPOSES は期待通り12種類ちょうど", () => {
    expect(Object.keys(SETTINGS_CRYPTO_PURPOSES)).toHaveLength(12);
  });

  test("SETTINGS_CRYPTO_PURPOSES 単体で重複がない", () => {
    const values = Object.values(SETTINGS_CRYPTO_PURPOSES);
    expect(new Set(values).size).toBe(values.length);
  });

  test("参照される settings key はすべて registry に実在する", () => {
    const unknown = refs.flatMap((r) =>
      r.kind === "settings" && !(r.key in SETTINGS_CRYPTO_PURPOSES)
        ? [`${r.file}: ${SETTINGS_REGISTRY_IDENTIFIER}.${r.key}`]
        : [],
    );
    expect(unknown).toEqual([]);
  });

  test("1 つの purpose を宣言しているファイルは 1 つだけ", () => {
    // 同じ文字列が別々のファイルで宣言されていると、それが「同じ用途の再利用」なのか
    // 「新しい用途が既存と衝突した」のかを機械的に区別できない。宣言を 1 箇所に寄せて
    // おけば、衝突は必ず値の重複として現れる。
    const byValue = new Map<string, Set<string>>();
    for (const ref of refs) {
      if (ref.kind !== "literal") continue;
      byValue.set(
        ref.value,
        (byValue.get(ref.value) ?? new Set<string>()).add(ref.file),
      );
    }

    expect(byValue.size).toBeGreaterThan(10);
    expect(
      [...byValue]
        .filter(([, files]) => files.size > 1)
        .map(([value, files]) => `${value}: ${[...files].sort().join(" | ")}`),
    ).toEqual([]);
  });

  test("リポジトリ全体で purpose が重複していない", () => {
    const all = [
      readDefaultPurpose(),
      ...Object.values(SETTINGS_CRYPTO_PURPOSES),
      ...CALENDAR_TOKEN_KINDS.map((kind) => purposeFor(kind)),
      ...literals,
    ];

    const duplicates = all.filter(
      (value, index) => all.indexOf(value) !== index,
    );
    expect(duplicates).toEqual([]);
  });

  test("AST 収集が実在の purpose を拾えている（見本）", () => {
    // 手書きリスト時代に 2 度取りこぼした顔ぶれ。名指しで押さえる。
    for (const purpose of [
      "form-render",
      "marketing-unsubscribe",
      "event-registration-payment",
      "receipt-download",
    ]) {
      expect(literals).toContain(purpose);
    }
  });

  /**
   * 鍵ローテーションの runbook は「何を再暗号化すれば終わりか」を読む場所で、
   * 実測時は 14 列あるうち 5 つしか挙げていなかった（しかも実在しない model 名で）。
   * 落とした列は、旧 kid を secondary list から外した瞬間に読めなくなる。
   *
   * runbook は列名を並べるのではなく registry を SSoT として指すが、件数だけは
   * 本文に出る。purpose を増やしたら runbook を読み直す、をここで強制する。
   */
  test("鍵ローテーション runbook の件数が registry と一致する", () => {
    const runbook = readFileSync(
      join(ROOT, "docs", "runbooks", "encryption-key-rotation.md"),
      "utf8",
    );
    const count = Object.keys(SETTINGS_CRYPTO_PURPOSES).length;
    expect(runbook).toContain(
      `the ${String(count)} integration secrets registered in\n  \`src/shared/lib/crypto-purposes.ts\``,
    );
    expect(runbook).toContain(`The ${String(count)} settings columns in`);
  });

  test("calendar-token.ts の動的 purpose が Settings 系と衝突しない", () => {
    const settingsValues = new Set<string>(
      Object.values(SETTINGS_CRYPTO_PURPOSES),
    );
    for (const kind of CALENDAR_TOKEN_KINDS) {
      expect(settingsValues.has(purposeFor(kind))).toBe(false);
    }
  });
});
