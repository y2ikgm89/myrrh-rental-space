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
 * 3 の充足として認めるのは `toBeGreaterThan(n)` / `toBeGreaterThanOrEqual(n)` /
 * `toContain(…)` の 3 つ。ファイル単位で見る——guard は「走査が空でない」ことを
 * 示す専用の test として書かれるのが実際の形で、どの式がどの集合を指すかまでは
 * 静的に追わない。**追えると誤解させるより、粗いと書いておくほうがいい。**
 *
 * `readFileSync` は対象に入れない。固定パスを読む gate は、パスが消えれば
 * throw するので黙って緑にならない。
 */

/** ディレクトリを走査する（＝結果が空になりうる）呼び出し。 */
const SCAN_CALLEES = new Set(["readdirSync", "globSync", "globSync"]);

/** 集合が空であることの assert。 */
const EMPTY_MATCHERS = new Set(["toEqual", "toStrictEqual", "toHaveLength"]);

/** 規模の下限として認める matcher。 */
const SIZE_MATCHERS = new Set([
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toContain",
]);

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
    /** @type {import("estree").Node | null} */
    let firstEmptyAssert = null;

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (name === null) return;

        if (SCAN_CALLEES.has(name)) {
          scansDirectory = true;
          return;
        }

        // `git ls-files` を走らせて一覧を得る gate も対象。
        if (name === "execFileSync" || name === "execSync") {
          const source = context.sourceCode.getText(node);
          if (source.includes("ls-files")) scansDirectory = true;
          return;
        }

        if (SIZE_MATCHERS.has(name)) {
          hasSizeGuard = true;
          return;
        }

        if (EMPTY_MATCHERS.has(name) && isEmptyArgument(node.arguments[0])) {
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
