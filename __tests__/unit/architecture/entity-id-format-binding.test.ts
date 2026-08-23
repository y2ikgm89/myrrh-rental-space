/**
 * 「この repo の ID 形式は 1 つ」を `prisma/schema.prisma` から機械強制する gate。
 *
 * ID 形式の取り違えは、統一前このリポジトリで**繰り返し本番に出ていた**バグ class:
 *
 * - #904 — マイページのキャンセルが cuid の申込 ID を `z.uuid()` で検証しており、
 *   実在する申込 ID を全て拒否していた
 * - #1747 — `TermsAgreement.resourceId` が `@db.Uuid` で、規約同意付きの
 *   イベント申込が P2007 で必ず失敗していた（公開フォームが丸ごと壊れていた）
 * - 同じ理由で `AdminNotification.resourceId` を uuid → varchar へ
 *   広げる migration が必要になった
 *
 * cuid だった 5 モデルを uuid へ寄せ、混在そのものを無くした。
 * **この gate はその状態を固定する**もので、`@default(cuid())` のモデルが 1 つでも
 * 戻ると落ちる。形式が 1 つである限り、上のバグ class は構造的に起こらない。
 *
 * 宣言だけでなく `entityIdSchema` の挙動も見る（switch が壊れれば同じことなので）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  ENTITY_ID_LABELS,
  entityIdSchema,
  type EntityIdModel,
} from "@/shared/lib/validations/entity-id";

const ROOT = process.cwd();

/** `@default(...)` から読み取れる ID 生成子。 */
type SchemaIdGenerator =
  "uuid" | "uuidV4" | "cuid" | "cuid2" | "singleton" | "other";

/** 自前で生成する ID に許す生成子。 */
const ALLOWED_GENERATORS: ReadonlySet<SchemaIdGenerator> = new Set([
  "uuid",
  // 単一行モデル（Settings 系）は主キーが固定文字列
  "singleton",
]);

/**
 * 主キーが**外部システムの識別子**であるモデル。uuid にはできない。
 *
 * `@default` を持たない（= アプリが値を渡す）ことまで含めて固定する。ここに
 * `@default` が生えたら「外部 ID を受け取る」という前提が崩れているので落とす。
 */
const EXTERNAL_ID_MODELS: Readonly<Record<string, string>> = {
  StripeEvent: "Stripe が発行する event.id（`evt_...`）をそのまま主キーにする",
};

/**
 * 主キーが**文字列 ID ではない**モデル。
 *
 * この gate が守っているのは「uuid か cuid か」という**ID 形式**の統一で、
 * 自然キー（意味を持つ値そのものを主キーにする）はその問いの外にある。
 * ただし黙って対象外にすると「uuid にすべき実体を Int 主キーにした」を
 * 見逃すので、理由を宣言させる。宣言が実態と合っているかは下で検査する。
 */
const NATURAL_KEY_MODELS: Readonly<Record<string, string>> = {
  ReceiptSequence:
    "年そのものが主キー（年ごとの連番）。実体ではなくカウンタなので ID を持たない",
  IntegrationHealth:
    "主キーは IntegrationKey enum（連携あたり 1 行）。実体 ID ではなくレジストリ行なので uuid を持たない",
};

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
  ID_FIELD_TYPES.clear();

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

    const declaredType = /^\s*\w+\s+(\w+)/u.exec(line)?.[1];
    ID_FIELD_TYPES.set(currentModel, declaredType ?? "unknown");
    generators.set(currentModel, classifyIdGenerator(line));
  }

  return generators;
}

/** `@id` フィールドの宣言型（`String` / `Int` …）。自然キーの判定に使う。 */
const ID_FIELD_TYPES = new Map<string, string>();

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

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";
// ここは**旧形式のまま**でなければ意味を持たない（通ってはいけない値の見本）。
// fixture 一括置換の対象にしないこと。
const SAMPLE_CUID = "cm60x9k3p0000qzrm8f3a1b2c";
const SAMPLE_CUID2 = "tz4a98xxat96iws9zmbrgj3a";

const REGISTERED_MODELS = Object.keys(ENTITY_ID_LABELS) as EntityIdModel[];

describe("ID 形式は 1 つに統一されている", () => {
  test("schema.prisma のパースと src 走査が機能している（前提の自己検査）", () => {
    // モデルを 1 つも拾えていないと以降の assertion が全部 vacuous に通る。
    expect(SCHEMA_ID_GENERATORS.size).toBeGreaterThan(50);
    // **走査集合そのもの**の下限（監査 A-24）。schema のパースが成功しても
    // `git ls-files src` が 0 件になれば offenders は空のまま緑になる。実測 2322 ファイル。
    expect(trackedSourceFiles().length).toBeGreaterThan(1500);
    expect(SCHEMA_ID_GENERATORS.get("Reservation")).toBe("uuid");
    expect(SCHEMA_ID_GENERATORS.get("EventRegistration")).toBe("uuid");
    expect(SCHEMA_ID_GENERATORS.get("SettingsSystem")).toBe("singleton");
  });

  test("自前生成の主キーは uuid(7) か singleton のどちらか", () => {
    // ここが緑である限り「どの形式で検証するか」を選ぶ余地が無い＝ #904 が起きない。
    // cuid / cuid2 / bare uuid() を足すとこのテストが落ちる。
    const offenders = [...SCHEMA_ID_GENERATORS.entries()]
      .filter(([model]) => !(model in EXTERNAL_ID_MODELS))
      .filter(([model]) => !(model in NATURAL_KEY_MODELS))
      .filter(([, generator]) => !ALLOWED_GENERATORS.has(generator))
      .map(([model, generator]) => `${model}: @default は "${generator}"`);

    expect(offenders).toEqual([]);
  });

  test("自然キーと宣言したモデルは主キーが文字列 ID でない", () => {
    // 宣言だけ残して実態が `String @id @default(uuid(7))` に戻ると、
    // そのモデルは ID 形式の検査から静かに外れる。実態を見て落とす。
    const contradictions = Object.keys(NATURAL_KEY_MODELS).map((model) => ({
      model,
      idType: ID_FIELD_TYPES.get(model),
    }));

    expect(contradictions).toEqual([
      { model: "ReceiptSequence", idType: "Int" },
      { model: "IntegrationHealth", idType: "IntegrationKey" },
    ]);
  });

  test("外部 ID を主キーにするモデルは @default を持たないまま", () => {
    // 例外の理由（外部システムが値を決める）が実態と合っているかを確かめる。
    const offenders = Object.keys(EXTERNAL_ID_MODELS)
      .map((model) => ({ model, generator: SCHEMA_ID_GENERATORS.get(model) }))
      .filter(({ generator }) => generator !== "other")
      .map(
        ({ model, generator }) =>
          `${model}: 外部 ID のはずが @default が "${String(generator)}" になっている`,
      );

    expect(offenders).toEqual([]);
  });

  test("登録済みモデルは schema.prisma に実在する", () => {
    const unknown = REGISTERED_MODELS.filter(
      (model) => !SCHEMA_ID_GENERATORS.has(model),
    );

    expect(unknown).toEqual([]);
  });
});

describe("entityIdSchema の挙動", () => {
  test.each(REGISTERED_MODELS)("%s は uuid だけを通す", (model) => {
    const schema = entityIdSchema(model);

    expect(schema.safeParse(SAMPLE_UUID).success).toBe(true);

    // #904 の再発検知: 旧 cuid / cuid2 形式の ID を通してはいけない。
    for (const legacy of [SAMPLE_CUID, SAMPLE_CUID2]) {
      const rejected = schema.safeParse(legacy);
      expect(rejected.success).toBe(false);
      if (!rejected.success) {
        expect(rejected.error.issues[0]?.message).toBe(
          `${ENTITY_ID_LABELS[model]}IDが不正です`,
        );
      }
    }
  });
});

describe("形式で選ぶ ID スキーマを src に戻さない", () => {
  test("z.cuid / z.cuid2 は src のどこにも無い", () => {
    const offenders = trackedSourceFiles().filter((file) =>
      /\bz\.cuid2?\(/u.test(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  test("形式名を冠した旧 factory は復活していない", () => {
    const offenders = trackedSourceFiles().filter((file) =>
      /prismaCuid2?IdSchema/u.test(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
