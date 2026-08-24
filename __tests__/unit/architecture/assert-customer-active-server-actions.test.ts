/**
 * Customer.isActive / BLACKLIST gate は Server Action 側で強制する
 * (OAUTH-BETTER-AUTH-01 再発防止)。
 *
 * ## なぜ要るのか
 *
 * `MypageAuthGate` は Server Component 描画層のみカバーする。Server Action
 * (mypage / claim / guest-token cancel/edit) は独立の request context のため、
 * customer を解決したあとに `assertCustomerActive`
 * （または guest-token 経路の `assertGuestTokenCustomerGates`）を呼ばない限り、
 * 停止 / BLACKLIST 顧客の書込を通してしまう。
 *
 * ## 解決経路は 2 つある（監査 A-99）
 *
 * 以前は `getCustomerByUserId` の呼出だけを母集団にしており、
 * **`ensureCustomerLinked` で customer を解決する経路を見ていなかった**。
 * claim 2 ファイルだけをハードコードの別 test で担保していたが、それは
 * ファイル単位の grep だったので、**import さえ残っていれば呼出を消しても緑**になる
 * （この docstring が旧 gate の欠陥として挙げているのと同じ形）。
 *
 * 実測では `ensureCustomerLinked` 経路の 5 ファイルすべてが assert を呼んでおり、
 * **生の欠陥は無かった**。塞いだのは「今後 1 本忘れても緑になる」穴。
 *
 * ## 旧 gate との違い（架空の緑を止める）
 *
 * 旧 `architecture-boundaries.test.ts` 版は 2 つの穴があった:
 *
 * 1. ファイル filter が `/(?:^|[\\/])[^\\/]+\.ts$/u` で `.tsx` を対象外にしていた
 *    （現状は該当ファイルが無く実害はないが、将来 `.tsx` に Server Action を
 *    inline した瞬間に無条件で gate をすり抜ける）。
 * 2. 判定が **ファイル全体の文字列 grep** だった。同一ファイルに複数の
 *    exported async function があり、うち 1 つだけが `assertCustomerActive` を
 *    呼んでいても、別の関数が `getCustomerByUserId` を呼んで assert を欠いても
 *    ファイル全体では「どこかに assertCustomerActive がある」ため green になる。
 *    コメントの中に `assertCustomerActive` という語が出るだけでも green になる。
 *
 * 新 gate は TypeScript AST で **exported async function 単位**で
 * `getCustomerByUserId` 呼出と assert 呼出の共起を見る。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: `(public)` 配下の Server Action で `getCustomerByUserId` を呼ぶ
 * 関数は、同じ関数本体のどこかで `assertCustomerActive` または
 * `assertGuestTokenCustomerGates` を呼んでいること。
 *
 * **証明しない**: assert の呼出位置が `getCustomerByUserId` の**直後**であること
 * （順序までは見ない）。assert 自体が正しく isActive / BLACKLIST を検査する
 * ことは `guard.test.ts` 等のユニットテストの担当。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
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
  isVariableStatement,
  type FunctionDeclaration,
  type Node,
  type SourceFile,
} from "typescript";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const PUBLIC_APP_ROOT = join(SRC_ROOT, "app", "(public)");

const CUSTOMER_RESOLVER_NAMES = new Set([
  "getCustomerByUserId",
  "ensureCustomerLinked",
]);

const GATE_CALL_NAMES = new Set([
  "assertCustomerActive",
  "assertGuestTokenCustomerGates",
]);

interface Violation {
  readonly file: string;
  readonly functionName: string;
}

/** fixture 用の疑似ファイル内容（`analyzeSnippet` だけが書き込む）。 */
const FIXTURE = new Map<string, string>();

/** node のどこかに、与えた名前を呼ぶ CallExpression があるか。 */
function containsCallTo(node: Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const walk = (current: Node): void => {
    if (found) return;
    if (
      isCallExpression(current) &&
      isIdentifier(current.expression) &&
      names.has(current.expression.text)
    ) {
      found = true;
      return;
    }
    forEachChild(current, walk);
  };
  walk(node);
  return found;
}

/** node が `export` / `async` 等の与えた修飾を持つか（cast なしで modifiers を読む）。 */
function hasModifier(node: Node, kind: SyntaxKind): boolean {
  if (!canHaveModifiers(node)) return false;
  const modifiers = getModifiers(node) ?? [];
  return modifiers.some((m) => m.kind === kind);
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
 * 現状 repo は全て function declaration 形だが、将来この形が使われても
 * gate がすり抜けないようにする。
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

function collect(file: string): Violation[] {
  const text = FIXTURE.get(file) ?? readFileSync(file, "utf8");
  const source = createSourceFile(
    file,
    text,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );

  const targets: { name: string; body: Node }[] = [];
  forEachChild(source, (node) => {
    if (!isExportedAsyncFunctionDeclaration(node) || !node.body) return;
    targets.push({ name: node.name?.text ?? "<anonymous>", body: node.body });
  });
  targets.push(...exportedAsyncArrowDeclarations(source));

  const out: Violation[] = [];
  for (const { name, body } of targets) {
    if (!containsCallTo(body, CUSTOMER_RESOLVER_NAMES)) continue;
    if (containsCallTo(body, GATE_CALL_NAMES)) continue;
    out.push({
      file: relative(ROOT, file).replaceAll("\\", "/"),
      functionName: name,
    });
  }
  return out;
}

/**
 * fixture を **本番と同じ解析器**へ通す。
 *
 * gate 自身が「通してはいけないものを本当に落とすか」を毎回証明するために要る。
 * 別実装で確かめると、gate が壊れても fixture だけ緑になる。
 */
function analyzeSnippet(
  code: string,
  ext: ".ts" | ".tsx" = ".ts",
): Violation[] {
  const path = join(ROOT, `__gate_fixture__${ext}`);
  const original = FIXTURE.get(path);
  FIXTURE.set(path, code);
  try {
    return collect(path).map((v) => ({ ...v, file: "fixture" }));
  } finally {
    if (original === undefined) FIXTURE.delete(path);
    else FIXTURE.set(path, original);
  }
}

/** `(public)` 配下で `"use server"` を含む Server Action ファイル（`.ts` / `.tsx` 両方）。 */
function serverActionFiles(): string[] {
  return collectSourceFiles(PUBLIC_APP_ROOT).filter((file) => {
    const source = FIXTURE.get(file) ?? readFileSync(file, "utf8");
    return /["']use server["']/u.test(source);
  });
}

describe("Customer.isActive / BLACKLIST gate は Server Action 側で強制する (OAUTH-BETTER-AUTH-01 再発防止)", () => {
  test("走査対象と母集合が空でない（gate 自体が空振りしていない）", () => {
    const files = serverActionFiles();
    expect(files.length).toBeGreaterThan(0);
    // `.tsx` も対象にしていることを型レベルでも明示（現状 `.tsx` 対象は 0 件だが
    // filter 自体が `.ts` 限定に戻っていないことを sanity で固定する）。
    expect(files.every((f) => f.endsWith(".ts") || f.endsWith(".tsx"))).toBe(
      true,
    );
  });

  test("通ってはいけない書き方が実際に落ちる（fixture）", () => {
    // getCustomerByUserId を呼ぶが assert を一切呼ばない。
    expect(
      analyzeSnippet(
        `export async function badAction() {
          const customer = await getCustomerByUserId(userId);
          return customer;
        }`,
      ),
    ).toEqual([{ file: "fixture", functionName: "badAction" }]);

    // コメントの中に assertCustomerActive という語が出るだけ（旧 gate が
    // 通してしまっていた穴）。AST は識別子の呼出しか見ないため落ちる。
    expect(
      analyzeSnippet(
        `export async function badActionWithCommentOnly() {
          // TODO: call assertCustomerActive here later
          const customer = await getCustomerByUserId(userId);
          return customer;
        }`,
      ),
    ).toEqual([{ file: "fixture", functionName: "badActionWithCommentOnly" }]);

    // 同一ファイルに複数の exported async function があり、1 つだけが assert を
    // 呼んでいる場合、assert を欠く方だけが落ちる（旧ファイル単位 grep が
    // 通してしまっていた穴）。
    const multiFn = analyzeSnippet(
      `export async function goodAction() {
        const customer = await getCustomerByUserId(userId);
        await assertCustomerActive(customer.id);
      }
      export async function badAction() {
        const customer = await getCustomerByUserId(userId);
        return customer;
      }`,
    );
    expect(multiFn).toEqual([{ file: "fixture", functionName: "badAction" }]);

    // `ensureCustomerLinked` 経路も同じだけ落ちる（監査 A-99 で広げた側）。
    expect(
      analyzeSnippet(
        `export async function badEnsureLinkedAction() {
          const { customer } = await ensureCustomerLinked(session.user);
          return customer;
        }`,
      ),
    ).toEqual([{ file: "fixture", functionName: "badEnsureLinkedAction" }]);

    // `.tsx` でも同じ判定が働く（旧 `\.ts$` filter のバグ修正）。
    expect(
      analyzeSnippet(
        `export async function badTsxAction() {
          const customer = await getCustomerByUserId(userId);
          return customer;
        }`,
        ".tsx",
      ),
    ).toEqual([{ file: "fixture", functionName: "badTsxAction" }]);
  });

  test("通ってよい書き方は落ちない（fixture）", () => {
    // assertCustomerActive を同じ関数本体で呼んでいる。
    expect(
      analyzeSnippet(
        `export async function goodAction() {
          const customer = await getCustomerByUserId(userId);
          await assertCustomerActive(customer.id);
        }`,
      ),
    ).toEqual([]);

    // guest-token 経路は assertGuestTokenCustomerGates で代替可能。
    expect(
      analyzeSnippet(
        `export async function goodGuestAction() {
          const customer = await getCustomerByUserId(userId);
          await assertGuestTokenCustomerGates({
            resourceCustomerId: reservation.customerId,
            sessionCustomerId: customer?.id ?? null,
          });
        }`,
      ),
    ).toEqual([]);

    // getCustomerByUserId が nested closure (executeConformMutation の
    // callback 等) の中にあっても、assert が同じ外側関数の本体内の別 closure に
    // あれば拾う（本番の submitReservation / cancelGuestReservationAction の形）。
    expect(
      analyzeSnippet(
        `export async function goodActionWithNestedClosures() {
          return runGuestTokenMutation({
            guardMemberOwnership: async (entityId, sessionUserId) => {
              const customer = await getCustomerByUserId(sessionUserId);
              return { ok: true };
            },
            execute: async () => {
              await assertGuestTokenCustomerGates({
                resourceCustomerId: "x",
                sessionCustomerId: null,
              });
            },
          });
        }`,
      ),
    ).toEqual([]);

    // `ensureCustomerLinked` で解決して assert する形（claim / customer-merge /
    // consume-signup-terms / terms reagree の本番の形）。
    expect(
      analyzeSnippet(
        `export async function goodEnsureLinkedAction() {
          const { customer } = await ensureCustomerLinked(session.user);
          await assertCustomerActive(customer.id);
        }`,
      ),
    ).toEqual([]);

    // customer を解決しない exported async function は対象外
    // (fetchReservationPricingPreview のような無関係関数)。
    expect(
      analyzeSnippet(
        `export async function unrelatedAction() {
          return 1;
        }`,
      ),
    ).toEqual([]);
  });

  test("(public) 配下の Server Action で customer を解決する関数は同一本体で assertCustomerActive / assertGuestTokenCustomerGates を呼ぶ", () => {
    const files = serverActionFiles();
    // 走査規模の下限。0 件になったら offenders は必ず空で素通りする。
    expect(files.length).toBeGreaterThan(10);

    const offenders = files.flatMap((file) => collect(file));

    expect(
      offenders.map((o) => `${o.file} :: ${o.functionName}`),
      "Server Action で getCustomerByUserId / ensureCustomerLinked で customer を解決する関数は assertCustomerActive または assertGuestTokenCustomerGates を同一関数本体で呼ぶこと (OAUTH-BETTER-AUTH-01)。",
    ).toEqual([]);
  });
});
