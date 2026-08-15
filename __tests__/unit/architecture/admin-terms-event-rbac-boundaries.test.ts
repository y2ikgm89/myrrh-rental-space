import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ScriptTarget,
  SyntaxKind,
  canHaveModifiers,
  createSourceFile,
  forEachChild,
  getModifiers,
  isArrowFunction,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isStringLiteral,
  isVariableStatement,
  type FunctionDeclaration,
  type Node,
  type SourceFile,
} from "typescript";

const ROOT = process.cwd();
const ADMIN_DASHBOARD_ROOT = join(
  ROOT,
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function adminFilePath(...segments: string[]): string {
  return join(ADMIN_DASHBOARD_ROOT, ...segments);
}

function readAdminFile(...segments: string[]): string {
  return readFileSync(adminFilePath(...segments), "utf8");
}

// ---------------------------------------------------------------------------
// AST 解析: exported async function 単位で requireAdminPermission を見る
// ---------------------------------------------------------------------------

/** fixture 用の疑似ファイル内容（`analyzeSnippet` だけが書き込む）。 */
const FIXTURE = new Map<string, string>();

/** node が与えた修飾を持つか（cast なしで modifiers を読む）。 */
function hasModifier(node: Node, kind: SyntaxKind): boolean {
  if (!canHaveModifiers(node)) return false;
  return (getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** function declaration が `export` + `async` 修飾を両方持つか。 */
function isExportedAsyncFunctionDeclaration(
  node: Node,
): node is FunctionDeclaration {
  return (
    isFunctionDeclaration(node) &&
    node.body !== undefined &&
    hasModifier(node, SyntaxKind.ExportKeyword) &&
    hasModifier(node, SyntaxKind.AsyncKeyword)
  );
}

/**
 * `export const foo = async (...) => {...}` 形も対象に含める。
 * 現状この 2 ファイルは全て function declaration 形だが、旧・総数照合は
 * `^export async function` でしか export を数えなかったため、この形で
 * guard 無しの export を足すと分母も分子も増えず素通りしていた。
 */
function exportedAsyncArrowDeclarations(
  source: SourceFile,
): { name: string; body: Node }[] {
  const out: { name: string; body: Node }[] = [];
  forEachChild(source, (node) => {
    if (!isVariableStatement(node)) return;
    if (!hasModifier(node, SyntaxKind.ExportKeyword)) return;
    for (const decl of node.declarationList.declarations) {
      if (!isIdentifier(decl.name) || !decl.initializer) continue;
      const init = decl.initializer;
      if (!isArrowFunction(init) && !isFunctionExpression(init)) continue;
      if (!hasModifier(init, SyntaxKind.AsyncKeyword)) continue;
      out.push({ name: decl.name.text, body: init.body });
    }
  });
  return out;
}

/** 引数が文字列リテラルならその値、そうでなければ null。 */
function literalArgText(node: Node | undefined): string | null {
  if (node === undefined || !isStringLiteral(node)) return null;
  return node.text;
}

/**
 * node の部分木に `requireAdminPermission("<resource>", "<action>")` の呼出が
 * あるか。識別子の CallExpression しか見ないため、コメント中や文字列中に
 * 同じ語が出るだけでは true にならない。
 */
function containsPermissionGuard(
  node: Node,
  resource: string,
  action: string,
): boolean {
  let found = false;
  const walk = (current: Node): void => {
    if (found) return;
    if (
      isCallExpression(current) &&
      isIdentifier(current.expression) &&
      current.expression.text === "requireAdminPermission" &&
      literalArgText(current.arguments[0]) === resource &&
      literalArgText(current.arguments[1]) === action
    ) {
      found = true;
      return;
    }
    forEachChild(current, walk);
  };
  walk(node);
  return found;
}

/** ファイル内の exported async function（declaration 形 / arrow 形の両方）。 */
function exportedAsyncFunctions(file: string): { name: string; body: Node }[] {
  const text = FIXTURE.get(file) ?? readFileSync(file, "utf8");
  const source = createSourceFile(file, text, ScriptTarget.Latest, true);

  const targets: { name: string; body: Node }[] = [];
  forEachChild(source, (node) => {
    if (!isExportedAsyncFunctionDeclaration(node) || !node.body) return;
    targets.push({ name: node.name?.text ?? "<anonymous>", body: node.body });
  });
  targets.push(...exportedAsyncArrowDeclarations(source));
  return targets;
}

/** 自分の関数本体に guard を持たない exported async function の名前一覧。 */
function unguardedExportNames(
  file: string,
  resource: string,
  action: string,
): string[] {
  return exportedAsyncFunctions(file)
    .filter(({ body }) => !containsPermissionGuard(body, resource, action))
    .map(({ name }) => name);
}

/**
 * fixture を **本番と同じ解析器**へ通す。別実装で確かめると、解析器が壊れても
 * fixture だけ緑になる。
 */
function analyzeSnippet(
  code: string,
  resource: string,
  action: string,
): string[] {
  const path = join(ROOT, "__gate_fixture__.ts");
  FIXTURE.set(path, code);
  try {
    return unguardedExportNames(path, resource, action);
  } finally {
    FIXTURE.delete(path);
  }
}

/**
 * Round-5 audit Finding #11 / #12: terms/agreements と events/[id]/waitlist の
 * 読取ページが `_shared/queries` の RBAC ラッパーを経由せず
 * `shared/domain/**\/admin-queries` を直接 import しており、
 * `requireAdminPermission` を一切通らずに閲覧可能だった（sidebar 上は
 * 権限フィルタで非表示になるだけで、直接 URL アクセスは防がれていなかった）。
 * terms 配下・events 配下の全ページで同型の gap があったため、
 * page.tsx が domain query を直 import せず `@/admin/queries/*` 経由になっている
 * ことを回帰防止として固定する。
 *
 * ## 判定は関数単位（第6次監査 M-17 の修正）
 *
 * 旧版は `_shared/queries/{terms,event}.ts` について
 * 「ファイル全体での `requireAdminPermission(...)` 出現回数 == `export async
 * function` の個数」という**総数照合**だった。実測: `terms.ts` の
 * `getAdminAgreements` から guard を消し `getAdminTermsList` に重複追加すると
 * 6 == 6 のまま **緑**になり、無防備な export を通していた。さらに export 側を
 * `^export async function` の正規表現で数えていたため、
 * `export const foo = async () => {...}` 形は分母にも分子にも数えられず、
 * この形の無防備な export も素通りしていた。
 * 現版は TypeScript AST で **exported async function 単位**に、その関数本体の
 * 部分木へ `requireAdminPermission("<resource>", "read")` の CallExpression が
 * あるかを見る。所属判定は関数ノードの body（`FunctionDeclaration.body` /
 * arrow の `initializer.body`）の部分木で、行番号や順序は使わない。
 *
 * **証明しない**: guard が関数の**先頭**にあること（順序は見ない）。
 * `requireAdminPermission` を別名 import した場合（識別子名でしか照合しない）。
 * guard 呼出が実行されない closure の中にあるケース。
 */
describe("admin terms/event RBAC boundaries", () => {
  test("terms admin ページは domain query を直 import しない", () => {
    const pages = [
      ["terms", "page.tsx"],
      ["terms", "agreements", "page.tsx"],
      ["terms", "trash", "page.tsx"],
      ["terms", "[id]", "edit", "page.tsx"],
    ];

    for (const pagePath of pages) {
      const source = readAdminFile(...pagePath);
      expect(source).not.toMatch(
        /from "@\/shared\/domain\/terms\/admin-queries"/u,
      );
    }
  });

  test("events admin ページは domain query を直 import しない", () => {
    const pages = [
      ["events", "page.tsx"],
      ["events", "new", "page.tsx"],
      ["events", "[id]", "page.tsx"],
      ["events", "[id]", "edit", "page.tsx"],
      ["events", "[id]", "broadcast", "page.tsx"],
      ["events", "[id]", "check-in", "page.tsx"],
      ["events", "[id]", "waitlist", "page.tsx"],
    ];

    for (const pagePath of pages) {
      const source = readAdminFile(...pagePath);
      expect(source).not.toMatch(
        /from "@\/shared\/domain\/events\/(admin-queries|registration-queries|waitlist-queries)"/u,
      );
    }
  });

  test("_shared/queries/terms.ts は export ごとに自分の本体で terms:read を gate する", () => {
    const file = adminFilePath("_shared", "queries", "terms.ts");

    expect(exportedAsyncFunctions(file).length).toBeGreaterThan(5);
    expect(
      unguardedExportNames(file, "terms", "read"),
      `_shared/queries/terms.ts の export は、自分の関数本体で requireAdminPermission("terms", "read") を呼ぶこと。隣の関数に 2 本あってもこの関数の代わりにはならない。`,
    ).toEqual([]);
  });

  test("_shared/queries/event.ts は export ごとに自分の本体で event:read を gate する", () => {
    const file = adminFilePath("_shared", "queries", "event.ts");

    expect(exportedAsyncFunctions(file).length).toBeGreaterThan(9);
    expect(
      unguardedExportNames(file, "event", "read"),
      `_shared/queries/event.ts の export は、自分の関数本体で requireAdminPermission("event", "read") を呼ぶこと。隣の関数に 2 本あってもこの関数の代わりにはならない。`,
    ).toEqual([]);
  });

  test("guard が隣の関数へ移動した形が落ちる（fixture）", () => {
    // (1) 第6次監査 M-17 の変異そのもの。guard が隣の関数へ移動しても
    //     ファイル全体での出現回数は 2 のまま変わらない（旧・総数照合はここを通した）。
    expect(
      analyzeSnippet(
        `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          await requireAdminPermission("terms", "read");
          return [];
        }
        export async function getAdminAgreements() {
          return { items: [], total: 0 };
        }`,
        "terms",
        "read",
      ),
    ).toEqual(["getAdminAgreements"]);

    // (2) 関数単位で 1 本ずつ揃っていれば落ちない（arrow 形も対象に入る）。
    //     偽陽性が出ないことの見本。
    expect(
      analyzeSnippet(
        `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          return [];
        }
        export const getAdminAgreements = async () => {
          await requireAdminPermission("terms", "read");
          return { items: [], total: 0 };
        };`,
        "terms",
        "read",
      ),
    ).toEqual([]);

    // (3) arrow 形の無防備な export も落ちる。
    //     これが無いと `exportedAsyncArrowDeclarations` の呼出を削除しても
    //     (2) は `[]` のまま緑になり（拾われないだけなので違反も出ない）、
    //     実 2 ファイルは全て declaration 形なので実ファイル側でも検出できない。
    expect(
      analyzeSnippet(
        `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          return [];
        }
        export const getAdminAgreements = async () => {
          return { items: [], total: 0 };
        };`,
        "terms",
        "read",
      ),
    ).toEqual(["getAdminAgreements"]);

    // (4) resource / action が違う guard は代用にならない。
    //     これが無いと `literalArgText(...) === resource` の照合を消しても
    //     他の fixture・実ファイルが全て緑のままになる。
    expect(
      analyzeSnippet(
        `export async function getAdminTermsList() {
          await requireAdminPermission("event", "read");
          return [];
        }`,
        "terms",
        "read",
      ),
    ).toEqual(["getAdminTermsList"]);
  });
});
