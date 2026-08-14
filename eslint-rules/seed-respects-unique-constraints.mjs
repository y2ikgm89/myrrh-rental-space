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

/**
 * 「その行が既に在るか」を判定する読み取り（監査 F-17）。
 *
 * 旧実装は `findFirst` だけを見ていたが、**元の欠陥は `findUnique` だった**
 * （`prisma/seed.ts` のコメントが記録している）。partialIndexes preview により
 * 生成 client の `WhereUniqueInput` は partial unique の列を**単独 unique キーとして
 * 受け付ける**ので、`findFirst({ where: { slug, deletedAt: null } })` を
 * `findUnique({ where: { slug } })` に戻すと ESLint は緑のまま通る。
 *
 * 実 DB にソフトデリート済みの同 slug 行があると、`where: { deletedAt: null }` の
 * partial index の母集合**外**の行を「存在する」と判定して create をスキップし、
 * 新品でない DB でカテゴリーが欠けたまま seed が完走する。
 *
 * `findMany` / `count` も同じ用途で書けるので同列に扱う。
 */
const PROBE_METHODS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
]);
const WRITE_METHODS = new Set(["create", "createMany", "upsert"]);

/**
 * オブジェクトリテラルを field → 値のテキストで読む。
 *
 * - `analyzable: false` — そもそもオブジェクトリテラルではない
 * - `complete: false` — spread / computed key があり、**読めなかった部分がある**
 *
 * 2 つを分けるのが要点。書き込み側は「見えているリテラル」を検査できれば足りる
 * （読めない spread の中に隠れたリテラルはそもそも観測できない）。一方、削除の
 * `where` は**フィルタ全体**が分からないと範囲を証明できないので `complete` を要求する。
 * 両者を同じ真偽値で扱うと、`...declaredContent` を持つ正常な seed が大量に
 * 誤検知される（実測 22 件）か、範囲不明の削除が証明として通るかのどちらかになる。
 */
function readObjectProperties(node, sourceCode) {
  if (!node || node.type !== "ObjectExpression") {
    return { analyzable: false, complete: false, properties: new Map() };
  }

  const properties = new Map();
  let complete = true;
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) {
      complete = false;
      continue;
    }
    const key =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? String(property.key.value)
          : null;
    if (key === null) {
      complete = false;
      continue;
    }
    properties.set(
      key,
      normalizeExpression(sourceCode.getText(property.value)),
    );
  }
  return { analyzable: true, complete, properties };
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

/**
 * 削除が「その式文より上」で通る制御パス。
 *
 * 自分自身を包む式文から下（`ExpressionStatement` / `AwaitExpression` / 呼び出し）は
 * 落とす。残りが**その削除に到達するために通らなければならない分岐**になる。
 */
function controlPath(sourceCode, node) {
  const ancestors = sourceCode.getAncestors(node);
  // **最も内側**の式文で切る。最初に見つかったものを使うと、外側の
  // `await prisma.$transaction(async (tx) => { ... })` 自体が式文なので、
  // その内側の `if` / `for` を丸ごと落としてしまう（実 seed で空振りした）。
  const statementIndex = ancestors.findLastIndex(
    (ancestor) => ancestor.type === "ExpressionStatement",
  );
  return statementIndex === -1 ? ancestors : ancestors.slice(0, statementIndex);
}

/**
 * 削除が書き込みを **dominate** するか（＝書き込みへ至る全経路で必ず実行されるか）。
 *
 * 位置と囲み関数だけでは足りない。`if (reconcile) await deleteMany(...)` の後に
 * 無条件の `create` を置くと、条件が false の経路では既存行が残ったまま create に
 * 進む — lint は通るのに実行時に P2002 で落ちる。
 *
 * 削除の制御パス（分岐ノードとその枝）がすべて書き込み側にも現れることを要求すれば、
 * 「削除に到達する条件」は「書き込みに到達する条件」に含まれる。
 * 同じ `for` の中なら両方が同じループ本体を通るので通り、
 * `if` の片方の枝だけに削除があれば枝ノードが一致せず落ちる。
 */
function dominates(deletionPath, writePath) {
  const writeNodes = new Set(writePath);
  return deletionPath.every((node) => writeNodes.has(node));
}

/**
 * 書き込みペイロードから **1 行を表すオブジェクト**を取り出す。
 *
 * `createMany` は配列を取り、seed は `.map()` や `const rows = [...]` も使う。
 * `data` の直下だけを見ていると、それらの中のリテラルを丸ごと見落とす
 * （前身の grep gate は行単位で走査していたので拾えていた＝**カバレッジの後退**）。
 *
 * 解決できた形は中身を返し、解決できなかった形は `null` を返す。
 * `null` は「安全」ではなく「証明できない」— 呼び出し側が報告する。
 */
function collectRowObjects(node, sourceCode, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);

  if (node.type === "ObjectExpression") return [node];

  if (node.type === "ArrayExpression") {
    // **読めない要素で配列ごと捨てない。** `[...baseRows, { position: 0 }]` の
    // spread は追えないが、その隣に**見えているリテラル**がある。全部捨てると
    // 「見える分は検査する」という約束と食い違う。
    const rows = [];
    for (const element of node.elements) {
      if (element === null) continue;
      const nested = collectRowObjects(element, sourceCode, seen);
      if (nested === null) continue;
      rows.push(...nested);
    }
    return rows;
  }

  // `rows.map((row) => ({ ... }))` — コールバックの返す行を見る。
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "map"
  ) {
    const callback = node.arguments.at(-1);
    if (
      callback?.type === "ArrowFunctionExpression" ||
      callback?.type === "FunctionExpression"
    ) {
      if (callback.body.type !== "BlockStatement") {
        return collectRowObjects(callback.body, sourceCode, seen);
      }
      const returned = callback.body.body.find(
        (statement) => statement.type === "ReturnStatement",
      );
      if (returned?.argument) {
        return collectRowObjects(returned.argument, sourceCode, seen);
      }
    }
    return null;
  }

  // `const rows = [...]` のように束縛されている場合は宣言まで辿る。
  if (node.type === "Identifier") {
    const scope = sourceCode.getScope(node);
    for (let current = scope; current; current = current.upper) {
      const variable = current.variables.find((v) => v.name === node.name);
      if (variable === undefined) continue;
      // 再代入されるものは静的に決まらない。
      const writes = variable.references.filter((ref) => ref.isWrite());
      if (writes.length !== 1) return null;
      const init = variable.defs[0]?.node?.init;
      return init ? collectRowObjects(init, sourceCode, seen) : null;
    }
  }

  return null;
}

/**
 * オブジェクトリテラルへ辿り着く（`const args = {...}` の束縛も 1 段追う）。
 *
 * 呼び出しの引数を丸ごと変数へ括り出す書き方は普通にあるので、
 * 「引数がリテラルでなければ検査しない」だと簡単に素通りする。
 */
function resolveObjectExpression(node, sourceCode, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);

  if (node.type === "ObjectExpression") return node;
  if (node.type !== "Identifier") return null;

  const scope = sourceCode.getScope(node);
  for (let current = scope; current; current = current.upper) {
    const variable = current.variables.find((v) => v.name === node.name);
    if (variable === undefined) continue;
    if (variable.references.filter((ref) => ref.isWrite()).length !== 1) {
      return null;
    }
    const init = variable.defs[0]?.node?.init;
    return init ? resolveObjectExpression(init, sourceCode, seen) : null;
  }
  return null;
}

/**
 * upsert の `where` が固定している列 → 値。
 *
 * Prisma の upsert は単一 unique（`{ position: 0 }`）と複合キー
 * （`{ type_order: { type, order } }`）の 2 形を取る。複合キーは 1 段内側に
 * 実際の列が並ぶので、そこまで開く。
 */
function upsertPinnedFields(argument, sourceCode) {
  const whereProperty = argument.properties.find(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      property.key.type === "Identifier" &&
      property.key.name === "where",
  );
  if (whereProperty === undefined) return new Map();

  const where = readObjectProperties(whereProperty.value, sourceCode);
  if (!where.analyzable) return new Map();

  const pinned = new Map(where.properties);

  // 複合キーの wrapper（`type_order: { ... }`）を開く。
  if (whereProperty.value.type === "ObjectExpression") {
    for (const property of whereProperty.value.properties) {
      if (property.type !== "Property" || property.computed) continue;
      if (property.value.type !== "ObjectExpression") continue;
      const nested = readObjectProperties(property.value, sourceCode);
      if (!nested.analyzable) continue;
      for (const [field, value] of nested.properties) pinned.set(field, value);
    }
  }

  return pinned;
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
        '{{model}} の存在判定 ({{method}}) の where に "{{field}}" が無い。({{group}}) の unique は {{field}} 条件の partial index なので、判定の母集合を制約の述語に揃える必要がある',
      predicateValueMismatch:
        '{{model}} の存在判定 ({{method}}) の "{{field}}" が制約の述語と違う（宣言 {{declared}} / probe {{actual}}）。母集合が反転すると有効な行を見落とし、conflict する create に進む',
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

          // 引数の形で 3 通りに分ける。**「引数が読めない」を「引数が無い」と
          // 同一視しない** — `deleteMany(args)` のように変数へ括り出されていると、
          // 条件付きの削除が「母集合ごと空にする削除」に化ける。
          let state;
          if (argument === undefined) {
            // `deleteMany()` は全件削除。
            state = {
              unconditional: true,
              analyzable: true,
              properties: new Map(),
            };
          } else if (argument.type !== "ObjectExpression") {
            state = {
              unconditional: false,
              analyzable: false,
              properties: new Map(),
            };
          } else {
            const hasSpread = argument.properties.some(
              (property) => property.type !== "Property",
            );
            // 引数そのものに spread があると `where` の有無すら決められない。
            const whereProperty = argument.properties.find(
              (property) =>
                property.type === "Property" &&
                !property.computed &&
                property.key.type === "Identifier" &&
                property.key.name === "where",
            );

            if (hasSpread) {
              state = {
                unconditional: false,
                analyzable: false,
                properties: new Map(),
              };
            } else if (whereProperty === undefined) {
              // `deleteMany({})` に where は無い＝全件削除。
              state = {
                unconditional: true,
                analyzable: true,
                properties: new Map(),
              };
            } else {
              const where = readObjectProperties(
                whereProperty.value,
                sourceCode,
              );
              // フィルタに読めない部分があれば範囲を証明できない。
              const usable = where.analyzable && where.complete;
              state = {
                unconditional: usable && where.properties.size === 0,
                analyzable: usable,
                properties: where.properties,
              };
            }
          }

          deletions.push({
            model: call.model,
            scope: enclosingFunction(sourceCode, node),
            path: controlPath(sourceCode, node),
            end: node.range[1],
            ...state,
          });
          return;
        }

        if (WRITE_METHODS.has(call.method)) {
          checkWrite(node, call);
          return;
        }

        if (PROBE_METHODS.has(call.method)) {
          checkProbe(node, call);
        }
      },
    };

    function checkWrite(node, call) {
      const groups = uniqueGroups.get(call.model);
      if (groups === undefined) return;

      // 引数そのものが変数へ括り出されていても辿る。
      // `const args = { data: { position: 0 } }; create(args)` を素通りさせない。
      const argument = resolveObjectExpression(node.arguments[0], sourceCode);
      if (argument === null) return;

      const scope = enclosingFunction(sourceCode, node);
      const writePath = controlPath(sourceCode, node);
      const upsertKeys =
        call.method === "upsert"
          ? upsertPinnedFields(argument, sourceCode)
          : new Map();

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

        // `createMany` は配列を取り、seed は `.map()` や `const rows = [...]` も
        // 使う。直下のオブジェクトだけを見ると、そこに入ったリテラルを
        // 丸ごと見落とす（前身の gate は行単位で走査していたので拾えていた）。
        // 解決できない形（destructure の spread、関数呼び出しの戻り値など）は
        // **見えるリテラルが 1 つも無い**ので検査対象が存在しない。報告しても
        // 実 seed の正常なコードを 22 箇所叩くだけで、blanket disable を招いて
        // rule 自体を空洞化させる。ここは rule の適用範囲の境界として明示する。
        const rows = collectRowObjects(holder.value, sourceCode) ?? [];

        for (const row of rows) {
          const data = readObjectProperties(row, sourceCode);
          if (!data.analyzable) continue;

          for (const [field, value] of data.properties) {
            if (!isPositionalLiteral(value)) continue;

            const relevant = groups.filter((group) =>
              group.fields.includes(field),
            );
            if (relevant.length === 0) continue;

            for (const group of relevant) {
              // **その値自体を upsert の where キーにする**のは規約が名指しして
              // いる安全な形。キーが一致して
              // いれば既存行は update されるだけで、衝突しようがない。
              if (
                call.method === "upsert" &&
                group.fields.every((field) => {
                  const pinned = upsertKeys.get(field);
                  return (
                    pinned !== undefined &&
                    pinned === data.properties.get(field)
                  );
                })
              ) {
                continue;
              }

              // 削除は**書き込みを dominate している**ものだけを証明に使う。
              // 位置と囲み関数だけだと、`if (reconcile) deleteMany(...)` の後の
              // 無条件 create が「守られている」ことになってしまう。
              const candidates = deletions.filter(
                (deletion) =>
                  deletion.model === call.model &&
                  deletion.scope === scope &&
                  deletion.end <= node.range[0] &&
                  dominates(deletion.path, writePath),
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
                node: row,
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
                method: call.method,
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
              data: {
                model: call.model,
                method: call.method,
                field,
                declared,
                actual,
              },
            });
          }
        }
      }
    }
  },
};

export default rule;
