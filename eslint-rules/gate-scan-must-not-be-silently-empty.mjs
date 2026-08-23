/**
 * 走査して「違反 0 件」を assert する gate に、走査規模の下限を要求する。
 *
 * ## 何を防ぐのか
 *
 * `__tests__/unit/architecture/**` の gate の多くは
 *
 *     const files = collectSourceFiles(root);
 *     const offenders = files.filter(isViolation);
 *     expect(offenders).toEqual([]);
 *
 * という形をしている。この形は **`files` が空でも緑を返す**。つまり
 * 「調べて違反が無かった」と「調べる対象が 1 つも無かった」を区別できない。
 *
 * 実測で 5 本がこの状態だった。決定的だったのは変異テストで、
 * `collectSourceFiles` の拡張子判定を潰して 0 件を返させると
 * **4 件中 3 件が pass** した——gate は完全に空振りしながら緑だった。
 *
 * ## なぜ「走査 gate を禁止する」ではないのか
 *
 * 当初は「ソースを走査する gate を全廃する」計画だった。実測が前提を否定した:
 *
 * | 分類 | 件数 |
 * | --- | --- |
 * | 走査 gate 全体 | 150 |
 * | 直接 assert 型（対象が常に 1。空振り不能） | 74 |
 * | 走査規模の自己検査あり | 46 |
 * | 判定を export して見本で固定済み | 約 25 |
 * | **実際に欠陥だった** | **5**（3.3%） |
 *
 * 145 本の機能している gate を消して 5 本の欠陥を防ぐのは割に合わない。
 * **禁じるのは手法ではなく欠陥そのもの。**
 *
 * ## 判定
 *
 * 次の 3 つが揃ったら報告する:
 *
 * 1. ディレクトリを走査する（`readdirSync` / `globSync` / `git ls-files`）
 * 2. 集合が空であることを assert する（`toEqual([])` / `toHaveLength(0)`）
 * 3. **規模の下限を 1 つも assert していない**
 *
 * 3 の充足として認めるのは **1 以上の下限を証明する数値 assert だけ**:
 *
 *   - `toBeGreaterThan(n)`（n >= 0。`> 0` は「1 件以上」を意味する）
 *   - `toBeGreaterThanOrEqual(n)`（n >= 1）
 *
 * `toContain(…)` は認めない。初版は認めていたが、**受け手を見ないので
 * `expect(source).toContain("<html")` のような無関係な文字列検査でも
 * ファイル全体が「guard あり」になった**（Codex 指摘、実例
 * `next-error-boundary-contract.test.ts`）。`toBeGreaterThanOrEqual(0)` も
 * 常に真なので認めない。`.not.` を挟んだ否定形も数えない。
 *
 * ファイル単位で見る点は変えない——guard は「走査が空でない」ことを示す専用の
 * test として書かれるのが実際の形で、どの式がどの集合を指すかまでは静的に
 * 追わない。**追えると誤解させるより、粗いと書いておくほうがいい。**
 *
 * `readFileSync` は対象に入れない。固定パスを読む gate は、パスが消えれば
 * throw するので黙って緑にならない。
 */

/** ディレクトリを走査する（＝結果が空になりうる）呼び出し。 */
// `scanSync` は `new Bun.Glob(...).scanSync(...)`。旧実装は `"globSync"` を 2 回
// 書いており（Set なので実効 2 件）、Bun.Glob の走査を認識できていなかった。
// 結果、下限 assert の欠落は「手で守ること」として
// `.claude/rules/architecture-gates.md` に委ねられていた（監査 F-13）。
const SCAN_CALLEES = new Set(["readdirSync", "globSync", "scanSync"]);

/**
 * 共有 helper 経由の走査（監査 A-25）。
 *
 * 走査を helper へ出すとファイル内に `readdirSync` が残らず、rule は無報告になっていた。
 * 実例: `auth-gate-ssot.test.ts` は `collectSourceFiles` で 850 ファイル走査して
 * `toEqual([])` していたが、下限 assert が 1 つも無く、変異検査で緑のままだった。
 *
 * **名前だけでは判定しない.** import 元がこの module 群であることを見る。
 * 同名のローカル関数を誤って走査扱いしないため。
 */
const SCAN_HELPER_MODULE_PATTERN =
  /(?:helpers\/architecture-fs|support\/tracked-files)$/u;

/** 集合が空であることの assert。 */
const EMPTY_MATCHERS = new Set(["toEqual", "toStrictEqual", "toHaveLength"]);

/**
 * **否定形の包含検査も「空の assert」と数える（監査 A-25）。**
 *
 * `terms-lexical-clean-break.test.ts` は走査結果 3499 ファイルを 1 本の文字列へ
 * 連結して `expect(source).not.toContain(...)` だけをしていた。`toEqual([])` を
 * 使わないので `assertsEmpty` が立たず、走査 0 件でも緑だった。
 * 「無いこと」を証明する形はすべて走査規模の下限を必要とする。
 */
const NEGATED_ABSENCE_MATCHERS = new Set([
  "toContain",
  "toContainEqual",
  "toMatch",
]);

/**
 * 規模の下限を証明する matcher と、その最小しきい値。
 *
 * `toBeGreaterThan(0)` は「1 件以上」。`toBeGreaterThanOrEqual(0)` は常に真なので
 * 下限を証明しない。
 *
 * **しきい値は数値リテラルで書くこと。** 識別子（`MIN_SCANNED_FILES` 等）は
 * 追わない — 定数に切り出されると値が判定できず、下限が無いものとして報告する。
 * スコープ解決を足せば追えるが、それは「下限がいくつか」を読む人から隠すのと
 * 引き換えになる。リテラルのほうが、落ちた人がその場で判断できる。
 */
const SIZE_MATCHER_MIN_THRESHOLD = new Map([
  ["toBeGreaterThan", 0],
  ["toBeGreaterThanOrEqual", 1],
]);

/** `expect(x).not.toBeGreaterThan(0)` のような否定形か。 */
function isNegated(callee) {
  let node = callee;
  while (node.type === "MemberExpression") {
    if (node.property.type === "Identifier" && node.property.name === "not") {
      return true;
    }
    node = node.object;
  }
  return false;
}

function calleeName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.property.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

/** `[]` リテラル、または `0`。 */
function isEmptyArgument(arg) {
  if (arg === undefined) return false;
  if (arg.type === "ArrayExpression") return arg.elements.length === 0;
  return arg.type === "Literal" && arg.value === 0;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "走査して違反 0 件を assert する gate は、走査規模の下限も assert する",
    },
    schema: [],
    messages: {
      missingScanGuard:
        "この gate はディレクトリを走査して「違反 0 件」を assert しているが、走査規模の下限を 1 つも assert していない。走査が 0 件になると「違反なし」と区別できず、黙って緑になる。expect(<走査結果>.length).toBeGreaterThan(<下限>) を足すこと。",
    },
  },

  create(context) {
    let scansDirectory = false;
    let assertsEmpty = false;
    let hasSizeGuard = false;
    /** 走査 helper の import 名（`collectSourceFiles` 等）。 */
    const scanHelperNames = new Set();
    /** @type {import("estree").Node | null} */
    let firstEmptyAssert = null;

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          typeof source !== "string" ||
          !SCAN_HELPER_MODULE_PATTERN.test(source)
        ) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            scanHelperNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        const name = calleeName(node.callee);
        if (name === null) return;

        if (SCAN_CALLEES.has(name) || scanHelperNames.has(name)) {
          scansDirectory = true;
          return;
        }

        // `git ls-files` を走らせて一覧を得る gate も対象。
        if (name === "execFileSync" || name === "execSync") {
          const source = context.sourceCode.getText(node);
          if (source.includes("ls-files")) scansDirectory = true;
          return;
        }

        const threshold = SIZE_MATCHER_MIN_THRESHOLD.get(name);
        if (threshold !== undefined) {
          const arg = node.arguments[0];
          const proves =
            arg !== undefined &&
            arg.type === "Literal" &&
            typeof arg.value === "number" &&
            arg.value >= threshold;
          if (proves && !isNegated(node.callee)) hasSizeGuard = true;
          return;
        }

        if (EMPTY_MATCHERS.has(name) && isEmptyArgument(node.arguments[0])) {
          assertsEmpty = true;
          firstEmptyAssert ??= node;
          return;
        }

        // `expect(x).not.toContain(...)` も「無いこと」の assert（監査 A-25）。
        if (NEGATED_ABSENCE_MATCHERS.has(name) && isNegated(node.callee)) {
          assertsEmpty = true;
          firstEmptyAssert ??= node;
        }
      },

      "Program:exit"(program) {
        if (!scansDirectory || !assertsEmpty || hasSizeGuard) return;
        context.report({
          node: firstEmptyAssert ?? program,
          messageId: "missingScanGuard",
        });
      },
    };
  },
};

export default rule;
