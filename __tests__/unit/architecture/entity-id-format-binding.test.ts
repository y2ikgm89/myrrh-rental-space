/**
 * `entityIdSchema` が返す形式を `prisma/schema.prisma` に縛りつける gate。
 *
 * ID 形式の取り違えは、このリポジトリで**繰り返し本番に出ている**バグ class:
 *
 * - #904 — マイページのキャンセルが cuid の申込 ID を `z.uuid()` で検証しており、
 *   実在する申込 ID を全て拒否していた
 * - #1747 — `TermsAgreement.resourceId` が `@db.Uuid` で、規約同意付きの
 *   イベント申込が P2007 で必ず失敗していた（公開フォームが丸ごと壊れていた）
 * - 20260726030000 — 同じ理由で `AdminNotification.resourceId` を uuid → varchar へ
 *   広げる migration が必要になった
 *
 * 原因は一貫して「呼び出し側が形式を選ぶ」設計だったので、入口をモデル名に寄せた
 * うえで、形式の正しさをここで schema と突き合わせる。
 *
 * **宣言の一致だけでなく挙動も見る。** 宣言が合っていても `entityIdSchema` の
 * switch が壊れれば同じバグが戻るため、実際に safeParse させて確かめる。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  ENTITY_ID_SPECS,
  entityIdSchema,
  type EntityIdModel,
  type EntityIdFormat,
} from "@/shared/lib/validations/entity-id";

const ROOT = process.cwd();

/** `@default(...)` から読み取れる ID 生成子。 */
type SchemaIdGenerator =
  "uuid" | "uuidV4" | "cuid" | "cuid2" | "singleton" | "other";

/**
 * schema.prisma の各モデルの `@id` 行から生成子を読む。
 *
 * CRLF で checkout されたツリーでも列を取りこぼさないよう `/\r?\n/` で割る
 * （varchar gate で一度これに嵌まっている）。
 */
function readSchemaIdGenerators(): Map<string, SchemaIdGenerator> {
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const generators = new Map<string, SchemaIdGenerator>();

  let currentModel: string | null = null;

  for (const rawLine of schema.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.startsWith("//")) continue;

    const modelStart = /^model\s+(\w+)\s*\{$/u.exec(line);
    if (modelStart?.[1] !== undefined) {
      currentModel = modelStart[1];
      continue;
    }

    if (line === "}") {
      currentModel = null;
      continue;
    }

    // `@@id([a, b])` は複合主キーなので除外する（`@id` を部分文字列に含む）
    if (currentModel === null || !/(?<!@)@id\b/u.test(line)) continue;

    generators.set(currentModel, classifyIdGenerator(line));
  }

  return generators;
}

function classifyIdGenerator(line: string): SchemaIdGenerator {
  if (/@default\(uuid\(7\)\)/u.test(line)) return "uuid";
  if (/@default\(uuid\(\)\)/u.test(line)) return "uuidV4";
  if (/@default\(cuid\(2\)\)/u.test(line)) return "cuid2";
  if (/@default\(cuid\(\)\)/u.test(line)) return "cuid";
  if (/@default\("singleton"\)/u.test(line)) return "singleton";
  return "other";
}

function trackedSourceFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  }).toString("utf8");

  return stdout
    .split(String.fromCharCode(0))
    .filter((entry) => entry.length > 0)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"));
}

const SCHEMA_ID_GENERATORS = readSchemaIdGenerators();

const SAMPLE_IDS = {
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  cuid: "cm60x9k3p0000qzrm8f3a1b2c",
  cuid2: "tz4a98xxat96iws9zmbrgj3a",
} as const;

/**
 * #904 の再発検知に使う「通ってはいけない値」。
 *
 * 比較式（`format === "uuid" ? …`）で書くと、登録が cuid 系だけの今は
 * TS2367（重なりが無い比較）になる。表にしておけば uuid のモデルを
 * 登録した時点でそのまま意味を持つ。
 */
const WRONG_SAMPLE_FOR_FORMAT: Record<EntityIdFormat, string> = {
  uuid: SAMPLE_IDS.cuid,
  cuid: SAMPLE_IDS.uuid,
  // cuid2 の正規表現は英小文字と数字だけを許すので、ハイフンを含む uuid を弾く
  cuid2: SAMPLE_IDS.uuid,
};

const REGISTERED_MODELS = Object.keys(ENTITY_ID_SPECS) as EntityIdModel[];

describe("entityIdSchema と schema.prisma の結合", () => {
  test("schema.prisma のパースが機能している（前提の自己検査）", () => {
    // モデルを 1 つも拾えていないと以降の assertion が全部 vacuous に通る。
    expect(SCHEMA_ID_GENERATORS.size).toBeGreaterThan(50);
    expect(SCHEMA_ID_GENERATORS.get("Reservation")).toBe("uuid");
    expect(SCHEMA_ID_GENERATORS.get("EventTimeSlot")).toBe("cuid2");
    expect(SCHEMA_ID_GENERATORS.get("SettingsSystem")).toBe("singleton");
  });

  test("登録済みモデルの format が schema.prisma の @default と一致する", () => {
    const mismatches = REGISTERED_MODELS.map((model) => {
      const declared = ENTITY_ID_SPECS[model].format;
      const actual = SCHEMA_ID_GENERATORS.get(model);
      if (actual === declared) return null;
      return `${model}: entity-id.ts は "${declared}" だが schema.prisma は "${String(actual)}"`;
    }).filter((entry) => entry !== null);

    expect(mismatches).toEqual([]);
  });

  test("uuid 以外の ID を持つモデルは全て登録されている", () => {
    // 未登録のまま新しい cuid モデルが増えると、呼び出し側がまた形式を勘で
    // 選ぶことになる（それが #904 の入口だった）。
    const unregistered = [...SCHEMA_ID_GENERATORS.entries()]
      .filter(([, generator]) => generator === "cuid" || generator === "cuid2")
      .map(([model]) => model)
      .filter((model) => !(model in ENTITY_ID_SPECS));

    expect(unregistered).toEqual([]);
  });

  test("uuid の ID は全て uuid(7)（バージョン混在を許さない）", () => {
    const v4Models = [...SCHEMA_ID_GENERATORS.entries()]
      .filter(([, generator]) => generator === "uuidV4")
      .map(([model]) => model);

    expect(v4Models).toEqual([]);
  });
});

describe("entityIdSchema の挙動", () => {
  test.each(REGISTERED_MODELS)("%s は宣言どおりの形式だけを通す", (model) => {
    const schema = entityIdSchema(model);
    const { format, label } = ENTITY_ID_SPECS[model];

    expect(schema.safeParse(SAMPLE_IDS[format]).success).toBe(true);

    const rejected = schema.safeParse(WRONG_SAMPLE_FOR_FORMAT[format]);

    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues[0]?.message).toBe(`${label}IDが不正です`);
    }
  });
});

describe("形式で選ぶ ID スキーマを src に戻さない", () => {
  test("z.cuid / z.cuid2 の直呼びは entity-id.ts だけ", () => {
    const offenders = trackedSourceFiles().filter((file) => {
      if (
        file.replaceAll("\\", "/") === "src/shared/lib/validations/entity-id.ts"
      ) {
        return false;
      }
      return /\bz\.cuid2?\(/u.test(readFileSync(join(ROOT, file), "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  test("形式名を冠した旧 factory は復活していない", () => {
    const offenders = trackedSourceFiles().filter((file) =>
      /prismaCuid2?IdSchema/u.test(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
