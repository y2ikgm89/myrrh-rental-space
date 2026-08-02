/**
 * ESLint rule: `seed-respects-unique-constraints`
 *
 * seed の書き込みと存在判定が **schema の一意制約と噛み合う**ことを強制する。
 * 噛み合っていないと再実行が P2002 で中断し、seed は `main().catch` で
 * `process.exit(1)` するので以降の phase が丸ごと走らない。Playwright の
 * webServer chain は seed → build → start なので、ローカルの E2E スイートが
 * そもそも起動しなくなる。
 *
 * ## なぜ AST なのか（これは 2 度目の教訓）
 *
 * 前身は `prisma/seed.ts` を正規表現で走査するテストだった。壊れ方が判明するたび
 * に広げ、5 回広げた末に 1 回のレビューで穴が 3 つ出た:
 *
 * - `deleteMany({ where: filter })` のように where が変数だと「解析できなかった」
 *   が「条件なしの全削除」と同義に潰れ、免除が通っていた
 * - 単一列の一意グループでは「自分以外の列」が空集合になり、`.every()` が
 *   無条件に true を返した（＝どんな削除でも免除された）
 * - 免除を (関数, model, 列) 単位で持っていたので、同じ関数の 2 つ目の create が
 *   別のキー空間へ書いていても 1 つ目の証明が流用された
 *
 * 3 つとも「文字列は構造を見られない」ことの現れで、広げても次の形で再発する。
 * `require-trimmed-text` が同じ理由で grep から AST へ移ったのと同型なので、
 * こちらも AST へ移した。位置・スコープ・入れ子は AST の性質であって、
 * 正規表現で近似するものではない。
 *
 * ## 強制する 2 つの不変条件
 *
 * 1. **一意列に数値リテラルを書かない。** 配列の宣言順や index から literal で
 *    書かれがちだが、管理画面の並び替え・追加で既存行がその値を占有していると
 *    即衝突する。正しい形は「max + 1 で採番」か「その値自体を upsert の
 *    where キーにする」。
 *
 *    ただし **その create の直前に、同じキー空間を空にする削除があるなら安全**。
 *    証明は create ごとに、その create の data と、同じ関数内でそれより前にある
 *    `deleteMany` の where を突き合わせて行う。
 *
 * 2. **partial unique を持つ model の存在判定は、その述語を同じ値で含める。**
 *    `@@unique([...], where: { deletedAt: null })` の母集合は未削除行だけ。
 *    `deletedAt: { not: null }` で引くと母集合が反転し、有効な行を見落として
 *    conflict する create に進む。キーの有無だけでなく**値**まで見る。
 *
 * 対象の model は client 変数名（`prisma` / `tx`）ではなく **schema の model 一覧**
 * で判定する。変数名で絞ると、transaction 化などで呼び出しの受け皿が変わった
 * 瞬間にその呼び出しが視界から消える（実際に一度そうなった）。
 */

import { join } from "node:path";

import {
  normalizeExpression,
  readModelsByClientProperty,
  readUniqueGroups,
} from "./prisma-schema.mjs";

const WRITE_METHODS = new Set(["create", "createMany", "upsert"]);

/** 解析結果。`analyzable: false` は「証明に使えない」を意味する（安全側）。 */
function readObjectProperties(node, sourceCode) {
  if (!node || node.type !== "ObjectExpression") {
    return { analyzable: false, properties: new Map() };
  }

  const properties = new Map();
  for (const property of node.properties) {
    // spread は中身が静的に分からない。computed key も同様。
    if (property.type !== "Property" || property.computed) {
      return { analyzable: false, properties: new Map() };
    }
    const key =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? String(property.key.value)
          : null;
    if (key === null) {
      return { analyzable: false, properties: new Map() };
    }
    properties.set(
      key,
      normalizeExpression(sourceCode.getText(property.value)),
    );
  }
  return { analyzable: true, properties };
}

/** `<anything>.<model>.<method>(...)` から model / method を取り出す。 */
function readPrismaCall(node, modelsByClientProperty) {
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  if (callee.property.type !== "Identifier") return null;

  const owner = callee.object;
  if (owner.type !== "MemberExpression" || owner.computed) return null;
  if (owner.property.type !== "Identifier") return null;

  const model = modelsByClientProperty.get(owner.property.name);
  if (model === undefined) return null;

  return { model, method: callee.property.name };
}

/** 直近の囲み関数。証明のスコープを閉じるために使う。 */
function enclosingFunction(sourceCode, node) {
  for (const ancestor of [...sourceCode.getAncestors(node)].reverse()) {
    if (
      ancestor.type === "FunctionDeclaration" ||
      ancestor.type === "FunctionExpression" ||
      ancestor.type === "ArrowFunctionExpression"
    ) {
      return ancestor;
    }
  }
  return null;
}

/** 一意列へ書かれたら危険な値か（数値リテラル / ループ index）。 */
function isPositionalLiteral(text) {
  return /^-?\d+$/u.test(text) || text === "i";
}

/**
 * その削除が、この create の書く行の一意キー空間を空にするか。
 *
 * 安全と言えるのは次のどちらかだけ:
 *
 * 1. 条件なしの削除（`deleteMany()` / `deleteMany({})` / `where: {}`）
 * 2. 削除の where が、その一意グループの列を**過不足なく**、create の data と
 *    同じ式で固定している
 *
 * 2 で「過不足なく」を要求するのが要点。余分な条件は削除範囲を**狭める**ので
 * （`isAvailable: true` を足せば非公開行は残る）、キー空間は空にならない。
 * 単一列グループでは「自分以外の列」が空集合になるため、**その列自身**が
 * 同じ値で固定されていることを要求する（そうしないと無条件 true になる）。
 */
function deletionClearsSlice(deletion, createData, group) {
  if (deletion.unconditional) return true;
  // where が変数・spread・computed の場合は「証明できない」＝安全ではない。
  if (!deletion.analyzable) return false;

  const required =
    group.fields.length === 1
      ? group.fields
      : group.fields.filter((field) => field !== group.literalField);

  const whereKeys = [...deletion.properties.keys()];
  if (whereKeys.length !== required.length) return false;

  return required.every((field) => {
    const deleted = deletion.properties.get(field);
    const created = createData.get(field);
    return (
      deleted !== undefined && created !== undefined && deleted === created
    );
  });
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "seed の書き込み・存在判定を prisma schema の一意制約と噛み合わせる",
    },
    schema: [
      {
        type: "object",
        properties: { schemaPath: { type: "string" } },
        additionalProperties: false,
      },
    ],
    messages: {
      literalUniqueWrite:
        "{{model}}.{{field}} は一意制約 ({{group}}) に参加する列で、リテラル {{value}} を書いている。並び替え・追加で既存行がその値を占有していると再実行が P2002 で中断する。max + 1 で採番するか、その値を upsert の where キーにするか、直前にそのキー空間を空にする deleteMany を置くこと",
      unprovableDeletion:
        "{{model}}.{{field}} のリテラル {{value}} を守る deleteMany の where を静的に解析できない（変数・spread・computed）。条件なしの削除にするか、where をオブジェクトリテラルで書いて一意グループ ({{group}}) を固定すること",
      missingPredicate:
        '{{model}}.findFirst の where に "{{field}}" が無い。({{group}}) の unique は {{field}} 条件の partial index なので、判定の母集合を制約の述語に揃える必要がある',
      predicateValueMismatch:
        '{{model}}.findFirst の "{{field}}" が制約の述語と違う（宣言 {{declared}} / probe {{actual}}）。母集合が反転すると有効な行を見落とし、conflict する create に進む',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const schemaPath =
      options.schemaPath ?? join(context.cwd, "prisma/schema.prisma");

    const uniqueGroups = readUniqueGroups(schemaPath);
    const modelsByClientProperty = readModelsByClientProperty(schemaPath);
    const sourceCode = context.sourceCode;

    /** model → その関数内の deleteMany 一覧（位置つき）。 */
    const deletions = [];

    return {
      CallExpression(node) {
        const call = readPrismaCall(node, modelsByClientProperty);
        if (call === null) return;

        if (call.method === "deleteMany") {
          const argument = node.arguments[0];
          const whereProperty =
            argument?.type === "ObjectExpression"
              ? argument.properties.find(
                  (property) =>
                    property.type === "Property" &&
                    !property.computed &&
                    property.key.type === "Identifier" &&
                    property.key.name === "where",
                )
              : undefined;

          const where =
            whereProperty === undefined
              ? null
              : readObjectProperties(whereProperty.value, sourceCode);

          deletions.push({
            model: call.model,
            scope: enclosingFunction(sourceCode, node),
            end: node.range[1],
            // 引数なし / `{}` / `where: {}` は母集合ごと空にする。
            unconditional:
              where === null ||
              (where.analyzable && where.properties.size === 0),
            analyzable: where !== null && where.analyzable,
            properties: where?.properties ?? new Map(),
          });
          return;
        }

        if (WRITE_METHODS.has(call.method)) {
          checkWrite(node, call);
          return;
        }

        if (call.method === "findFirst") {
          checkProbe(node, call);
        }
      },
    };

    function checkWrite(node, call) {
      const groups = uniqueGroups.get(call.model);
      if (groups === undefined) return;

      const argument = node.arguments[0];
      if (argument?.type !== "ObjectExpression") return;

      // create は `data`、upsert は `create` に書く値が入る。
      for (const key of ["data", "create"]) {
        const holder = argument.properties.find(
          (property) =>
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            property.key.name === key,
        );
        if (holder === undefined) continue;

        const data = readObjectProperties(holder.value, sourceCode);
        if (!data.analyzable) continue;

        const scope = enclosingFunction(sourceCode, node);
        for (const [field, value] of data.properties) {
          if (!isPositionalLiteral(value)) continue;

          const relevant = groups.filter((group) =>
            group.fields.includes(field),
          );
          if (relevant.length === 0) continue;

          for (const group of relevant) {
            const candidates = deletions.filter(
              (deletion) =>
                deletion.model === call.model &&
                deletion.scope === scope &&
                deletion.end <= node.range[0],
            );

            const proven = candidates.some((deletion) =>
              deletionClearsSlice(deletion, data.properties, {
                ...group,
                literalField: field,
              }),
            );
            if (proven) continue;

            const unprovable = candidates.some(
              (deletion) => !deletion.unconditional && !deletion.analyzable,
            );

            context.report({
              node: holder.value,
              messageId: unprovable
                ? "unprovableDeletion"
                : "literalUniqueWrite",
              data: {
                model: call.model,
                field,
                value,
                group: group.fields.join(", "),
              },
            });
          }
        }
      }
    }

    function checkProbe(node, call) {
      const partials = (uniqueGroups.get(call.model) ?? []).filter(
        (group) => group.predicate !== null,
      );
      if (partials.length === 0) return;

      const argument = node.arguments[0];
      if (argument?.type !== "ObjectExpression") return;

      const whereProperty = argument.properties.find(
        (property) =>
          property.type === "Property" &&
          !property.computed &&
          property.key.type === "Identifier" &&
          property.key.name === "where",
      );
      if (whereProperty === undefined) return;

      const where = readObjectProperties(whereProperty.value, sourceCode);
      if (!where.analyzable) return;

      for (const group of partials) {
        // その unique の列で引いている probe だけが対象。
        // `where: { status }` のような読み取りクエリは制約と無関係。
        const touchesKey = group.fields.some((field) =>
          where.properties.has(field),
        );
        if (!touchesKey) continue;

        for (const [field, declared] of group.predicate) {
          const actual = where.properties.get(field);
          if (actual === undefined) {
            context.report({
              node: whereProperty.value,
              messageId: "missingPredicate",
              data: {
                model: call.model,
                field,
                group: group.fields.join(", "),
              },
            });
            continue;
          }
          if (actual !== declared) {
            context.report({
              node: whereProperty.value,
              messageId: "predicateValueMismatch",
              data: { model: call.model, field, declared, actual },
            });
          }
        }
      }
    }
  },
};

export default rule;
