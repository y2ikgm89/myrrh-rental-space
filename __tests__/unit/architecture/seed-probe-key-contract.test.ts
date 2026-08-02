import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * seed の「存在判定」と「一意列への書き込み」が **schema の制約と噛み合う**ことの gate。
 *
 * ## 何が壊れるか
 *
 * `findFirst` で存在を見て無ければ `create` する形は seed の定番だが、判定キーと
 * 制約キーがずれていると**再実行が P2002 で中断**する。seed は `main().catch` で
 * `process.exit(1)` するので、そこから後ろの phase が丸ごと走らない。Playwright の
 * webServer chain は seed → build → start なので、**ローカルの E2E スイートが
 * そもそも起動しなくなる**。
 *
 * 実測（このリポジトリで踏んだもの）:
 *
 * ```
 * ❌ Seed failed: Unique constraint failed on the fields: (`type`, `"order"`)
 * ```
 *
 * `seedNavigation` は `(type, url)` で判定していたが制約は `@@unique([type, order])`。
 * url だけがずれた行（管理画面の `updateNavigationItem` は url を書き換えて order を
 * 据え置く／過去コミットの seed が別 url を入れた）があると、「無い」と判定して
 * 同じ order で create し衝突する。
 *
 * ## 2 つの不変条件（どちらも schema 駆動・表を持たない）
 *
 * 1. **unique に参加する列へリテラルを create しない。** 配列の宣言順や index から
 *    literal で書かれがちだが、管理画面の並び替え・追加で既存行がその値を占有して
 *    いると即衝突する。正しい形は「max + 1 で採番」（`seedSpaceCategories` が手本）か
 *    「その値自体を upsert の where キーにする」（`seedNavigation`）。
 *    どの列が unique かは **schema から読む**ので、`TransferAccount.sortOrder` のような
 *    index だけの列は対象外になる。
 *
 * 2. **partial unique を持つ model の存在判定は、その述語を where に含める。**
 *    `@@unique([...], where: { deletedAt: null })` の母集合は未削除行だけ。
 *    削除済み行を「存在する」と数えると create をスキップして表示が欠け、
 *    無視すると位置列が衝突する。判定対象は「その unique の列で引いている probe」
 *    だけに絞る（`where: { status }` のような読み取りクエリは対象外）。
 */

const root = process.cwd();
const SEED = join(root, "prisma/seed.ts");
const SCHEMA = join(root, "prisma/schema.prisma");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * 一意列にリテラルを書いてよい唯一の場所。
 *
 * `SEED_NAVIGATION_GROUPS` の `order` は **upsert の where キーそのもの**
 * （`where: { type_order: { type, order } }`）なので、宣言された値がそのまま
 * 一意キーになる。採番の余地がなく、衝突もしえない。
 */
const LITERAL_ALLOWED_BLOCK = "SEED_NAVIGATION_GROUPS";

interface PartialUnique {
  readonly model: string;
  readonly fields: readonly string[];
  /** 述語の field → 宣言値（`deletedAt: null` なら "null"）。 */
  readonly predicate: ReadonlyMap<string, string>;
}

function modelBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const model of read(SCHEMA).matchAll(
    /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu,
  )) {
    bodies.set(String(model[1]), String(model[2]));
  }
  return bodies;
}

/** `@@unique([...], where: {...})` を持つものだけ。 */
function readPartialUniques(): PartialUnique[] {
  const found: PartialUnique[] = [];
  for (const [model, body] of modelBodies()) {
    for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]([^)]*)\)/gu)) {
      const predicate = /where:\s*\{([^}]*)\}/u.exec(String(u[2]));
      if (!predicate?.[1]) continue;
      found.push({
        model,
        fields: String(u[1])
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
        predicate: new Map(
          [...predicate[1].matchAll(/(\w+)\s*:\s*([^,}]+)/gu)].map((m) => [
            String(m[1]),
            String(m[2]).trim(),
          ]),
        ),
      });
    }
  }
  return found;
}

/** model → unique（複合・partial・単一 `@unique` すべて）に参加する列。 */
function readUniqueColumns(): Map<string, Set<string>> {
  const byModel = new Map<string, Set<string>>();
  for (const [model, body] of modelBodies()) {
    const columns = new Set<string>();
    for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]/gu)) {
      for (const field of String(u[1]).split(",")) {
        columns.add(field.trim());
      }
    }
    for (const line of body.split("\n")) {
      const single = /^\s+(\w+)\s+\S+.*@unique/u.exec(line);
      if (single?.[1]) columns.add(single[1]);
    }
    if (columns.size > 0) byModel.set(model, columns);
  }
  return byModel;
}

function toClientProperty(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function toModelName(clientProperty: string): string {
  return clientProperty.charAt(0).toUpperCase() + clientProperty.slice(1);
}

interface SeedFunction {
  readonly name: string;
  readonly startLine: number;
  readonly body: string;
}

/** seed.ts を top-level 関数単位に切る。 */
function seedFunctions(): SeedFunction[] {
  const lines = read(SEED).split("\n");
  const starts: { name: string; index: number }[] = [];
  lines.forEach((line, index) => {
    const match = /^(?:async\s+)?function\s+(\w+)/u.exec(line);
    if (match?.[1]) starts.push({ name: match[1], index });
  });

  // **関数の閉じ括弧で切る。** 「次の関数の先頭まで」で切ると、関数と関数の間に
  // ある top-level 宣言（`SEED_NAVIGATION_GROUPS` 等）が手前の関数の body に
  // 紛れ込む。allowlist を body 一致で判定していたため、宣言 1 つのために
  // **その関数まるごと**が走査対象から外れていた。
  return starts.map((start) => {
    const nextTopLevelClose = lines.findIndex(
      (line, index) => index > start.index && line === "}",
    );
    const end = nextTopLevelClose === -1 ? lines.length : nextTopLevelClose + 1;
    return {
      name: start.name,
      startLine: start.index,
      body: lines.slice(start.index, end).join("\n"),
    };
  });
}

/**
 * `const <name> = ...;` の宣言が占める**行 offset**を返す。
 *
 * ネストを数えて対応する閉じ括弧まで辿るので、宣言が何行あってもその 1 ブロック
 * だけが対象になる。行単位で返すのは、違反行の行番号を `fn.body` の offset から
 * 出しているため — テキストを切り落とすと行番号がずれる。
 */
function declarationLineOffsets(body: string, name: string): Set<number> {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.includes(`const ${name} =`));
  if (first === -1) return new Set();

  const offsets = new Set<number>([first]);
  let depth = 0;
  let seenOpen = false;
  for (let i = first; i < lines.length; i++) {
    offsets.add(i);
    for (const char of lines[i] ?? "") {
      if (char === "[" || char === "{" || char === "(") {
        depth++;
        seenOpen = true;
      } else if (char === "]" || char === "}" || char === ")") {
        depth--;
      }
    }
    if (seenOpen && depth <= 0) break;
  }
  return offsets;
}

/** `@@unique([a, b])` / 単一 `@unique` を**グループ単位**で返す。 */
function readUniqueGroups(model: string): string[][] {
  const body = modelBodies().get(model);
  if (body === undefined) return [];

  const groups: string[][] = [];
  for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]/gu)) {
    groups.push(
      String(u[1])
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f.length > 0),
    );
  }
  for (const line of body.split("\n")) {
    const single = /^\s+(\w+)\s+\S+.*@unique/u.exec(line);
    if (single?.[1]) groups.push([single[1]]);
  }
  return groups;
}

/** `<call>({ <key>: { ... } })` の直下を field → 値で取り出す。 */
function objectArgument(
  body: string,
  callPattern: string,
  key: string,
): Map<string, string | null> | null {
  const match = new RegExp(
    `${callPattern}\\(\\{[\\s\\S]{0,200}?${key}:\\s*\\{`,
    "u",
  ).exec(body);
  if (!match) return null;

  const open = match.index + match[0].length;
  let depth = 1;
  let close = open;
  while (close < body.length && depth > 0) {
    const char = body[close];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    if (depth === 0) break;
    close++;
  }
  return parseWhereEntries(body.slice(open, close));
}

/**
 * その model の一意列にリテラルを書いてよいか — **削除がその行の一意キー空間を
 * 空にしていることまで**確かめる。
 *
 * 「作る前に `deleteMany` がある」だけでは足りない。フィルタ付きの削除は母集合の
 * 一部しか消さないので、たとえば footer のナビ行だけを消してから header 行を
 * リテラル order で作れば、header 側の既存行と普通に衝突する。
 *
 * 安全なのは次のどちらか:
 *
 * 1. 無条件の `deleteMany({})`（母集合が空になる）
 * 2. リテラルを書く列と同じ unique グループの**残り全部**を、削除の where と
 *    create の data が**同じ式**で固定している（＝その行が入るキー空間だけは
 *    確実に空になっている）
 *
 * 2 が `seedEvents` の形: `deleteMany({ where: { eventId: event.id } })` の後に
 * `create({ data: { eventId: event.id, sortOrder: 0 } })`。
 * `@@unique([eventId, sortOrder])` の `eventId` が両側で `event.id` に固定されて
 * いるので、その eventId 配下の sortOrder は必ず空。
 */
function literalIsSafeAfterDeletion(
  body: string,
  model: string,
  column: string,
): boolean {
  const clientProperty = toClientProperty(model);

  const deleteAt = body.search(
    new RegExp(`(?:prisma|tx)\\.${clientProperty}\\.deleteMany\\(`, "u"),
  );
  if (deleteAt === -1) return false;

  const createAt = body.search(
    new RegExp(
      `(?:prisma|tx)\\.${clientProperty}\\.(?:create|createMany|upsert)\\(`,
      "u",
    ),
  );
  // 作ってから消す順序では守られない。
  if (createAt === -1 || deleteAt > createAt) return false;

  const call = `(?:prisma|tx)\\.${clientProperty}`;
  const deleteWhere = objectArgument(body, `${call}\\.deleteMany`, "where");

  // `deleteMany({})` / `deleteMany({ where: {} })` は母集合ごと空にする。
  if (deleteWhere === null || deleteWhere.size === 0) return true;

  const createData = objectArgument(body, `${call}\\.create`, "data");
  if (createData === null) return false;

  const groups = readUniqueGroups(model).filter((group) =>
    group.includes(column),
  );
  if (groups.length === 0) return false;

  return groups.every((group) =>
    group
      .filter((field) => field !== column)
      .every((field) => {
        const deleted = deleteWhere.get(field);
        const created = createData.get(field);
        return (
          deleted !== undefined && created !== undefined && deleted === created
        );
      }),
  );
}

interface Violation {
  readonly line: number;
  readonly message: string;
}

/**
 * 関数が書き込む model の unique 列に、リテラルを書いている行。
 *
 * 「その関数が書く model」で絞るので、同名の列でも unique でない model
 * （`TransferAccount.sortOrder` は index のみ）は誤検知しない。
 */
function findLiteralUniqueWrites(): Violation[] {
  const uniqueColumns = readUniqueColumns();
  const violations: Violation[] = [];

  for (const fn of seedFunctions()) {
    // 免除は**宣言そのもの**に限る。以前は「body に宣言が含まれていたら
    // `continue`」だったが、関数スライスが次の関数の手前まで伸びていたため
    // top-level の宣言が手前の関数に紛れ込み、**その関数まるごと**が走査対象から
    // 外れていた。スライスは閉じ括弧で切るようにしたうえで、万一この宣言が
    // 関数内へ移動しても正しく振る舞うよう、ブロック単位で切り落とす。
    const exempt = declarationLineOffsets(fn.body, LITERAL_ALLOWED_BLOCK);

    const written = new Set(
      [
        ...fn.body.matchAll(
          /(?:prisma|tx)\.(\w+)\.(?:create|createMany|upsert)\(/gu,
        ),
      ]
        .map((m) => toModelName(String(m[1])))
        .filter((model) => uniqueColumns.has(model)),
    );
    if (written.size === 0) continue;

    const columns = new Set<string>();
    for (const model of written) {
      // **作る前に全部消している model は対象外。** リテラルが危険なのは
      // 「既存行がその値を占有しているかもしれない」からで、同じ関数が同じ
      // model を先に `deleteMany` していれば母集合は空になり、衝突しえない。
      // 例: `seedEvents` は tickets / slots / registrations を消してから
      // `sortOrder: 0` の ticket を 1 枚だけ作る（`@@unique([eventId, sortOrder])`）。
      for (const column of uniqueColumns.get(model) ?? []) {
        // **作る前に消していれば無条件で免除、ではない。** その削除が「これから
        // 作る行の一意キー空間」を空にしていることまで確かめる。
        if (literalIsSafeAfterDeletion(fn.body, model, column)) continue;
        columns.add(column);
      }
    }
    if (columns.size === 0) continue;

    const pattern = new RegExp(
      `\\b(${[...columns].join("|")}):\\s*(\\d+|i)\\s*,`,
      "u",
    );

    fn.body.split("\n").forEach((line, offset) => {
      if (exempt.has(offset)) return;
      const match = pattern.exec(line);
      if (!match) return;
      violations.push({
        line: fn.startLine + offset + 1,
        message: `${fn.name} — ${line.trim()} は unique 列にリテラルを書いている（${[...written].join(" / ")}）。並び替え・追加で既存行がその値を占有していると再実行が P2002 で中断する。max + 1 で採番するか、その値を upsert の where キーにすること`,
      });
    });
  }

  return violations;
}

/**
 * `prisma.<model>.findFirst({ where: { ... } })` の where 直下を field → 値で返す。
 *
 * **キーの有無だけでは足りない。** partial unique の述語が `isActive: true` の
 * ときに probe が `isActive: false` で引いていると、母集合が制約と逆になって
 * 有効な行を見落とし、conflict する create に進む — 防ぎたい P2002 がそのまま出る。
 * 値まで見て初めて「制約の述語に揃っている」と言える。
 * shorthand（`where: { slug }`）は値 `null` として記録する。
 */
function probeWhereClauses(
  clientProperty: string,
): Array<Map<string, string | null>> {
  const source = read(SEED);
  const pattern = new RegExp(
    // `tx.` も見る。作り直しを advisory lock 付きの transaction に入れた結果、
    // probe が `prisma.` から `tx.` に変わった箇所がある。片方しか見ないと、
    // tx 化した瞬間にその probe が gate の視界から消える。
    `(?:prisma|tx)\\.${clientProperty}\\.findFirst\\(\\{[\\s\\S]{0,120}?where:\\s*\\{`,
    "gu",
  );

  return [...source.matchAll(pattern)].map((m) => {
    // **ネストを正規表現で切らない。** `deletedAt: { not: null }` のような
    // 入れ子があると `[^{}]*` では where 全体を掴めず、その probe が丸ごと
    // gate の視界から消える — 一番危ない「述語を反転させた probe」が
    // 素通りしていた。深さを数えて対応する `}` まで取る。
    const open = m.index + m[0].length;
    let depth = 1;
    let close = open;
    while (close < source.length && depth > 0) {
      const char = source[close];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      if (depth === 0) break;
      close++;
    }

    return parseWhereEntries(source.slice(open, close));
  });
}

/** where 直下を `field → 値` に割る（ネストは値としてそのまま保持）。 */
function parseWhereEntries(body: string): Map<string, string | null> {
  const clause = new Map<string, string | null>();

  // top-level の `,` だけで割る。`{ not: null }` の内側の `,` で割らない。
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "{" || char === "[" || char === "(") depth++;
    if (char === "}" || char === "]" || char === ")") depth--;
    if (char === "," && depth === 0) {
      entries.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  entries.push(current);

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const withValue = /^(\w+)\s*:\s*([\s\S]+)$/u.exec(trimmed);
    if (withValue?.[1]) {
      clause.set(withValue[1], String(withValue[2]).trim());
      continue;
    }
    const shorthand = /^(\w+)$/u.exec(trimmed);
    if (shorthand?.[1]) clause.set(shorthand[1], null);
  }
  return clause;
}

describe("seed と schema の一意制約が噛み合っている", () => {
  test("gate が空振りしていない", () => {
    expect(readPartialUniques().length).toBeGreaterThan(0);
    expect(readUniqueColumns().size).toBeGreaterThan(0);
    expect(seedFunctions().length).toBeGreaterThan(10);
    // unique 列を持つ model を書く関数が実在すること（絞り込みが効きすぎていない）。
    expect(
      seedFunctions().some((fn) =>
        /(?:prisma|tx)\.\w+\.(?:create|upsert)\(/u.test(fn.body),
      ),
    ).toBe(true);
  });

  test("unique 列にリテラルを create しない", () => {
    expect(
      findLiteralUniqueWrites().map(
        (v) => `prisma/seed.ts:${String(v.line)} ${v.message}`,
      ),
    ).toEqual([]);
  });

  test("allowlist は upsert キーとして使う 1 ブロックだけ", () => {
    const source = read(SEED);
    // 宣言された order が where キーとして実際に使われていることを確認する。
    // 使われていないなら単なるリテラル書き込みなので allowlist は無効。
    expect(source).toContain(`const ${LITERAL_ALLOWED_BLOCK} =`);
    expect(source).toContain("where: { type_order: {");
  });

  test("partial unique の列で引く存在判定は述語を含む", () => {
    const violations = readPartialUniques().flatMap((partial) => {
      const clientProperty = toClientProperty(partial.model);
      return (
        probeWhereClauses(clientProperty)
          // その unique の列で引いている probe だけが対象。
          // `where: { status }` のような読み取りクエリは制約と無関係。
          .filter((clause) =>
            [...clause.keys()].some((key) => partial.fields.includes(key)),
          )
          .flatMap((clause, index) =>
            [...partial.predicate].flatMap(([field, declared]) => {
              const label = `prisma.${clientProperty}.findFirst #${String(index + 1)}`;
              if (!clause.has(field)) {
                return [
                  `${label}: where に "${field}" が無い。${partial.model} の (${partial.fields.join(", ")}) unique は ${field} 条件の partial index なので、判定の母集合を制約の述語に揃える必要がある`,
                ];
              }

              // 値まで一致していること。逆向きの述語で引くと母集合が反転し、
              // 有効な行を見落として conflict する create に進む。
              const actual = clause.get(field);
              if (actual !== declared) {
                return [
                  `${label}: "${field}" の値が制約と違う（宣言 ${declared} / probe ${actual ?? "(shorthand)"}）。partial index の述語と同じ値で引くこと`,
                ];
              }
              return [];
            }),
          )
      );
    });

    expect(violations).toEqual([]);
  });

  test("ナビゲーションは制約と同じキーで存在判定する", () => {
    // `(type, url)` で判定して order をリテラル create していた旧実装への逆戻り検出。
    expect(read(SEED)).not.toMatch(
      /navigationItem\.findFirst\([\s\S]{0,120}?url:/u,
    );
  });
});
