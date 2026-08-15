import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";
import {
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  canHaveModifiers,
  createSourceFile,
  forEachChild,
  getModifiers,
  isArrayLiteralExpression,
  isAwaitExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  type CallExpression,
  type FunctionDeclaration,
  type Node,
} from "typescript";

/**
 * 管理ページの認可はデータ取得より前（ページ本体）で解決する（ratchet）。
 *
 * ## この gate の目的（2026-07-31 に理由が変わった）
 *
 * 当初は「Suspense より前に置けば `redirect()` が実 3xx を返せる」ことを狙って
 * 導入した。しかし **その前提は誤りだった**: `(dashboard)/layout.tsx` は
 * `children` 自体を `<Suspense>` の内側に置き `DashboardChromeResolved` が
 * `connection()` で suspend するため、**ページ本体のどこに置いても**
 * ストリーミング開始後になる（PR #1704 に対する Codex P1 指摘）。
 *
 * a11y 側（meta refresh への劣化 = axe `meta-refresh` critical）は PR #1711 が
 * 拒否を `notFound()`（遷移せずその場に 404 境界を描画）へ変えて解決済みで、
 * **もはや認可の位置には依存しない**。
 *
 * それでもこの gate を残すのは別の理由による:
 *
 * - **fail-fast**: 認可をページ本体で解決すると、権限の無いユーザーに対して
 *   クエリを一切発行せずに拒否できる。Suspense 内の data loader に任せると
 *   DB クエリが走ってから拒否される。
 * - **可読性**: そのページが要求する権限が page.tsx を読むだけで分かる。
 *
 * ## 採用しなかった代替
 *
 * `forbidden()` / `unauthorized()` は v16.2.12 にも存在するが
 * **`experimental.authInterrupts` 必須の experimental で「本番非推奨」**と
 * 公式に明記され、authentication / data-security ガイドも一切言及しない。
 *
 * ## 何を見るか（2026-08-15 に判定を AST へ移した）
 *
 * 旧版は `require(AdminListPage|...)\s*\(` の文字列一致だった。呼出が残ってさえ
 * いれば通るため、`await` を `void` に変えるだけで認可の Promise が待たれない
 * ページを緑で通していた（第6次監査 M-13 の変異検査で実証）。`void` は
 * `@typescript-eslint/no-floating-promises` の公式エスケープで、`require-await` は
 * eslint.config.mjs の Next.js 契約 exempt で page.tsx に対して off なので、
 * ESLint 側にも受け皿が無い。
 *
 * いまは TypeScript AST で次を見る:
 *
 * - default export の `export default async function` 本体の中にある
 * - `PAGE_GUARD_NAMES` の識別子呼出で
 * - 最初の `<Suspense>` より前の位置にあり
 * - かつ **await されている**（素の `await` / `await Promise.all([...])` の要素 /
 *   括弧で包んだ形を認める）
 *
 * ものが 1 つ以上あること。`void x()` / 呼び捨て / `.catch()` チェーンは落ちる。
 *
 * **見ないこと**: どの resource を要求しているか（引数は検査しない）。
 * 認可 helper が resource:action を正しく解決すること自体は page-auth.ts の
 * 呼び先 `requireAdminPermission` の担当。
 *
 * ## ratchet 運用
 *
 * 既存違反は `PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST` に凍結する。新規追加は fail。
 * 解消したら allowlist から削除する（残したままだと stale として fail する）。
 * allowlist を触る PR は同時 OPEN 1 本まで（衝突すると解消済み判定が食い違うため）。
 */

const root = process.cwd();

/**
 * ページ本体（default export）で認可を解決する helper 群。
 *
 * **名前をここに写さない。** `page-auth.ts`（`auth-gate-ssot.test.ts` が管理ページ用
 * gate の facade SSoT として実在まで要求しているファイル）の export を AST で読んで
 * 導出する。写すと guard を 1 つ足すたびに 2 箇所を直すことになり、片方だけ直した
 * 状態が緑で通る。
 *
 * facade の export でないもの（`requireAdminPermission` 等の `_helpers` 直呼び）は
 * ここに入らない。ページからの `_helpers` 直 import は `auth-gate-ssot.test.ts` が
 * 別途禁止しているので、compliant と数えないほうが 2 つの gate の方針が揃う。
 */
const PAGE_AUTH_FACADE =
  "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts";

function collectPageGuardNames(): Set<string> {
  const text = readFileSync(join(root, ...PAGE_AUTH_FACADE.split("/")), "utf8");
  const source = createSourceFile(
    "page-auth.ts",
    text,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );

  const names = new Set<string>();
  forEachChild(source, (node) => {
    if (!isFunctionDeclaration(node) || node.name === undefined) return;
    if (!canHaveModifiers(node)) return;
    const modifiers = getModifiers(node) ?? [];
    if (
      !modifiers.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword)
    ) {
      return;
    }
    names.add(node.name.text);
  });

  return names;
}

const PAGE_GUARD_NAMES = collectPageGuardNames();

/** `await Promise.all([guard(), ...])` を await 済みとして認めるための combinator */
const PROMISE_COMBINATOR_NAMES = new Set(["all", "allSettled"]);

/**
 * 未解消の既存違反（凍結）。減らす方向にのみ更新する。
 */
const PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST: readonly string[] = [
  "src/app/(admin)/admin/(dashboard)/coupons/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/coupons/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/coupons/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/customers/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/broadcast/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/check-in/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/[id]/waitlist/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/categories/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/events/seo/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/[categoryId]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/review/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/seo/page.tsx",
  "src/app/(admin)/admin/(dashboard)/faq/trash/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/page.tsx",
  "src/app/(admin)/admin/(dashboard)/inquiries/tags/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/locations/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/media/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/news/page.tsx",
  "src/app/(admin)/admin/(dashboard)/notifications/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/[slug]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/pages/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/categories/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/tags/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/posts/trash/page.tsx",
  "src/app/(admin)/admin/(dashboard)/receipts/[serialNo]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/new-recurring/page.tsx",
  "src/app/(admin)/admin/(dashboard)/reservations/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/spaces/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/new/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/page.tsx",
  "src/app/(admin)/admin/(dashboard)/terms/trash/page.tsx",
];

/** `Promise.all(...)` / `Promise.allSettled(...)` の呼出か。 */
function isPromiseCombinatorCall(node: CallExpression): boolean {
  const callee = node.expression;
  return (
    isPropertyAccessExpression(callee) &&
    isIdentifier(callee.expression) &&
    callee.expression.text === "Promise" &&
    PROMISE_COMBINATOR_NAMES.has(callee.name.text)
  );
}

/**
 * その呼出が await されているか。
 *
 * 親を辿って `await` に到達すれば true。途中で通ってよいのは
 * 括弧 / 配列リテラル / `Promise.all` 系の引数だけで、それ以外
 * （`void` / `ExpressionStatement` / `.catch()` チェーン / `return`）は false。
 */
function isAwaited(call: CallExpression): boolean {
  let current: Node = call;
  let parent: Node | undefined = call.parent;

  while (parent !== undefined) {
    if (isAwaitExpression(parent)) return parent.expression === current;

    if (isParenthesizedExpression(parent) || isArrayLiteralExpression(parent)) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    if (
      isCallExpression(parent) &&
      isPromiseCombinatorCall(parent) &&
      parent.arguments.some((arg) => arg === current)
    ) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    return false;
  }

  return false;
}

/** `export default async function ...` の宣言（無ければ undefined）。 */
function defaultExportAsyncFunction(
  source: Node,
): FunctionDeclaration | undefined {
  let found: FunctionDeclaration | undefined;
  forEachChild(source, (node) => {
    if (found !== undefined) return;
    if (!isFunctionDeclaration(node) || node.body === undefined) return;
    if (!canHaveModifiers(node)) return;
    const modifiers = getModifiers(node) ?? [];
    const has = (kind: SyntaxKind): boolean =>
      modifiers.some((modifier) => modifier.kind === kind);
    if (
      has(SyntaxKind.ExportKeyword) &&
      has(SyntaxKind.DefaultKeyword) &&
      has(SyntaxKind.AsyncKeyword)
    ) {
      found = node;
    }
  });
  return found;
}

/** 本体内で最初に現れる `<Suspense>` の開始位置（無ければ +Infinity）。 */
function firstSuspenseStart(fn: FunctionDeclaration): number {
  let earliest = Number.POSITIVE_INFINITY;
  const walk = (node: Node): void => {
    if (
      (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) &&
      isIdentifier(node.tagName) &&
      node.tagName.text === "Suspense"
    ) {
      earliest = Math.min(earliest, node.getStart());
    }
    forEachChild(node, walk);
  };
  walk(fn);
  return earliest;
}

/**
 * default export 本体の、最初の `<Suspense>` より前の位置に
 * **await された** 認可 helper 呼出が 1 つ以上あるか。
 */
function hasAwaitedPageGuard(text: string): boolean {
  const source = createSourceFile(
    "page.tsx",
    text,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );

  const fn = defaultExportAsyncFunction(source);
  const body = fn?.body;
  if (fn === undefined || body === undefined) return false;

  const suspenseStart = firstSuspenseStart(fn);
  let guarded = false;
  const walk = (node: Node): void => {
    if (guarded) return;
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      PAGE_GUARD_NAMES.has(node.expression.text) &&
      node.getStart() < suspenseStart &&
      isAwaited(node)
    ) {
      guarded = true;
      return;
    }
    forEachChild(node, walk);
  };
  walk(body);

  return guarded;
}

function listDashboardPages(): string[] {
  const glob = new Glob("src/app/(admin)/admin/(dashboard)/**/page.tsx");
  return [...glob.scanSync(root)]
    .map((p) => p.split(sep).join("/"))
    .sort((a, b) => a.localeCompare(b));
}

function findViolations(): string[] {
  return listDashboardPages().filter((rel) => {
    const source = readFileSync(join(root, ...rel.split("/")), "utf8");
    return !hasAwaitedPageGuard(source);
  });
}

/**
 * 見本を **本番と同じ判定器**へ通す。別実装で確かめると、判定器が壊れても
 * 見本だけ緑になる。
 */
function analyzeSnippet(code: string): boolean {
  return hasAwaitedPageGuard(code);
}

describe("admin ページの認可は Suspense 境界より前で await して解決する", () => {
  test("guard 名を facade から導出できている（空振り防止）", () => {
    expect(PAGE_GUARD_NAMES.size).toBeGreaterThan(2);
    expect([...PAGE_GUARD_NAMES]).toContain("requireAdminDashboardPage");
  });

  test("allowlist 外の新規違反が無い", () => {
    // gate 自体が空振りしていないことの sanity check
    expect(listDashboardPages().length).toBeGreaterThan(0);

    const unexpected = findViolations().filter(
      (rel) => !PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST.includes(rel),
    );

    expect(unexpected).toEqual([]);
  });

  test("allowlist に解消済み entry が残っていない（ratchet）", () => {
    const violations = new Set(findViolations());
    const stale = PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST.filter(
      (rel) => !violations.has(rel),
    );

    expect(stale).toEqual([]);
  });

  test("監査ログページは解消済み（回帰防止）", () => {
    // PR #1704 で最初に解消したページ。allowlist へ差し戻さない。
    const rel = "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx";

    expect(PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST).not.toContain(rel);
    expect(findViolations()).not.toContain(rel);
  });

  test("guard 呼出が await されている形だけを compliant と判定する（見本）", () => {
    // 落ちてはいけない形 1: 素の await（audit-logs/page.tsx:70 の実際の形）
    expect(
      analyzeSnippet(
        `export default async function P() {
           await requireAdminListPage("auditLog");
           return <div />;
         }`,
      ),
    ).toBe(true);

    // 落ちてはいけない形 2: await Promise.all の要素
    // （staff/[id]/page.tsx:47-50 の実際の形。ここを落とすと既存ページが壊れる）
    expect(
      analyzeSnippet(
        `export default async function P() {
           const [currentUser, user] = await Promise.all([
             requireAdminDetailPage("user", id),
             getUser(id),
           ]);
           return <div />;
         }`,
      ),
    ).toBe(true);

    // 落ちるべき形 1: void（第6次監査 M-13 の変異。呼出は残るが認可は待たれない）
    expect(
      analyzeSnippet(
        `export default async function P() {
           void requireAdminListPage("auditLog");
           return <div />;
         }`,
      ),
    ).toBe(false);

    // 落ちるべき形 2: 素の呼び捨て
    expect(
      analyzeSnippet(
        `export default async function P() {
           requireAdminListPage("auditLog");
           return <div />;
         }`,
      ),
    ).toBe(false);

    // 落ちるべき形 3: Suspense 境界の内側でしか認可していない
    expect(
      analyzeSnippet(
        `export default async function P() {
           return (
             <Suspense fallback={null}>
               {await requireAdminListPage("auditLog")}
             </Suspense>
           );
         }`,
      ),
    ).toBe(false);

    // 落ちるべき形 4: page-auth.ts の export ではない helper を直に呼ぶ形。
    // `auth-gate-ssot.test.ts` がページからの `_helpers` 直 import を禁止しているので、
    // この形は compliant と数えてはいけない。旧実装は `PAGE_GUARD_NAMES` に
    // `requireAdminPermission` を写していたため true を返していた。
    expect(
      analyzeSnippet(
        `export default async function P() {
           await requireAdminPermission("auditLog", "read");
           return <div />;
         }`,
      ),
    ).toBe(false);
  });
});
