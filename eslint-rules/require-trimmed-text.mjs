/**
 * ESLint rule: `require-trimmed-text`
 *
 * Fails lint when a `z.string()` chain constrains length or emptiness without
 * first normalising with `.trim()`.
 *
 * Rationale:
 * `z.string().min(1)` accepts a single space. Applied to text a person types,
 * that stores a value which looks empty everywhere it is rendered — and runs
 * every side effect attached to it. The public inquiry form accepted a subject
 * and body of nothing but spaces and mailed the administrator about it.
 *
 * **Order is the whole point.** In Zod 4 `.trim()` is a `$ZodCheckOverwrite`
 * that rewrites `payload.value` when the checks run, in declaration order. So
 * `z.string().min(1).trim()` measures the padded value (passes), then trims it
 * to `""` — the exact defect, wearing the fix as a disguise. Measured:
 *
 *     z.string().trim().min(1).safeParse("   ")  -> rejected
 *     z.string().min(1).trim().safeParse("   ")  -> accepted, data === ""
 *
 * A predecessor of this rule was a test that grepped the source for the two
 * literals and asked whether both were present. It could not see the order, and
 * a chain of three widening rounds still left most syntactic shapes unmatched
 * (a schema reached through `.extend()`, an arrow-function factory, an element
 * schema inside `z.array()`). Walking the call chain from `z.string()` removes
 * both problems: position is a property of the AST, and where the expression
 * sits is irrelevant.
 *
 * Exemptions are per-site `eslint-disable-next-line` comments with a reason,
 * not a central list. Machine-generated values — tokens, uuids from a `<select>`,
 * slugs carrying their own pattern, an optimistic-lock timestamp — are the
 * legitimate cases: whitespace in those is a symptom to surface, not damage to
 * repair silently.
 */

/** Checks whose result depends on whether the value has been trimmed yet. */
const ORDER_SENSITIVE = new Set([
  "min",
  "max",
  "length",
  "nonempty",
  "regex",
  "startsWith",
  "endsWith",
  "includes",
  "refine",
  "superRefine",
  "check",
]);

/**
 * Checks that make the value a constrained format rather than free text.
 * A person does not hand-type these, and the format itself rejects padding.
 */
const FORMAT_CHECKS = new Set([
  "uuid",
  "cuid",
  "cuid2",
  "ulid",
  "email",
  "url",
]);

/**
 * 「長さを制約された自由テキスト」か。
 *
 * `.min(1)` だけを見ていると**任意テキストが丸ごと外れる**。`"   "` は空文字と違って
 * truthy なので、`{value && <p>{value}</p>}` のような描画ガードを素通りし、公開ページに
 * 中身のないブロックが出る（実測: `space-info.tsx` は駐車場案内が空白だけのとき
 * 「— 」だけの行を描画していた）。trim すれば `""` になり、そのガードが本来の意図
 * どおり落とす。だから `.max()` だけの任意テキストも対象に含める。
 *
 * `.min(0)` は何も制約しないので対象外。
 */
function constrainsLength(node) {
  const name = node.callee.property.name;
  if (name === "nonempty" || name === "length" || name === "max") return true;
  if (name !== "min") return false;
  const [arg] = node.arguments;
  return (
    arg?.type === "Literal" && typeof arg.value === "number" && arg.value >= 1
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require .trim() before any length or emptiness check on a z.string() chain, so a value of only whitespace cannot pass as text.",
      recommended: false,
    },
    schema: [],
    messages: {
      missingTrim:
        '長さを制約した自由テキストなのに `.trim()` を通していません。空白だけの入力は `""` と違って truthy なので、`{value && …}` の描画ガードを素通りして中身のないブロックが出ます。`z.string().trim().{{check}}(…)` に直してください。機械が生成する値（token / id / slug 等）なら、理由を書いた eslint-disable-next-line で明示してください。',
      trimTooLate:
        '`.trim()` が `.{{check}}(…)` より後ろにあります。Zod 4 の check は宣言順に走るので、この順序では**空白を含んだ値**が検査され、その後で空文字に潰れます（`z.string().min(1).trim()` は "   " を通し、data は "" になります）。`.trim()` を `.string()` の直後へ移してください。',
    },
  },

  create(context) {
    /** `z.string()` / bare `string()` imported from zod. */
    function isZodString(node) {
      if (node.type !== "CallExpression") return false;
      const { callee } = node;
      if (callee.type === "Identifier") return callee.name === "string";
      return (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier" &&
        callee.property.name === "string"
      );
    }

    return {
      CallExpression(node) {
        if (!isZodString(node)) return;

        // Walk outward: z.string() -> .a() -> .b() … recording each check in order.
        let current = node;
        let trimIndex = -1;
        let firstOrderSensitive = null;
        let lengthCheck = null;
        let isFormat = false;
        let index = 0;

        while (
          current.parent?.type === "MemberExpression" &&
          current.parent.object === current &&
          !current.parent.computed &&
          current.parent.property.type === "Identifier" &&
          current.parent.parent?.type === "CallExpression" &&
          current.parent.parent.callee === current.parent
        ) {
          const call = current.parent.parent;
          const name = current.parent.property.name;
          index += 1;

          if (name === "trim" && trimIndex === -1) trimIndex = index;
          if (FORMAT_CHECKS.has(name)) isFormat = true;
          if (ORDER_SENSITIVE.has(name) && firstOrderSensitive === null) {
            firstOrderSensitive = { name, index };
          }
          if (lengthCheck === null && constrainsLength(call)) {
            lengthCheck = { name, node: call };
          }

          current = call;
        }

        if (lengthCheck === null) return;
        // `.pipe(z.email())` and friends validate a format; padding cannot survive it.
        if (isFormat) return;

        if (trimIndex === -1) {
          context.report({
            node,
            messageId: "missingTrim",
            data: { check: lengthCheck.name },
          });
          return;
        }

        if (
          firstOrderSensitive !== null &&
          trimIndex > firstOrderSensitive.index
        ) {
          context.report({
            node,
            messageId: "trimTooLate",
            data: { check: firstOrderSensitive.name },
          });
        }
      },
    };
  },
};

export default rule;
