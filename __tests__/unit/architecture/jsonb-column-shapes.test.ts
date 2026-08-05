/**
 * `Json` 列が 1 本残らず形状を宣言していることの gate。
 *
 * ## 何が守られていなかったか
 *
 * jsonb 列 33 本のうち形状 CHECK があったのは 9 本で、**なぜその 9 本なのかは
 * どこにも書かれていなかった**。配列を期待する列に文字列が入っても DB は受理する。
 *
 * 壊れると顧客に出るもの:
 *
 * | 列 | 壊れると |
 * | --- | --- |
 * | `reservations.rate_breakdown_json` | 料金の内訳が表示できない（金額の根拠が読めない） |
 * | `receipts.issuer_snapshot` | 領収書の発行者情報が出ない（会計証跡） |
 * | `settings_features.feature_modules` | 機能の ON/OFF が fail-closed で全部 OFF になる |
 * | `spaces.business_hours` | 営業時間が読めず、予約可能枠が出ない |
 *
 * ## 「未設定」は SQL NULL 一本
 *
 * `Json?` 列では SQL NULL と JSON の `null` の両方が「未設定」を表せる。実際、
 * 省略された行は SQL NULL、`Prisma.JsonNull` で明示的に消した行は JSON null に
 * なっており、**同じ意味の値が 2 通り**存在していた。読み手が両方を扱う必要が
 * 出るので SQL NULL に寄せ、CHECK は JSON null を通さない。
 *
 * 例外は監査ログの `old_value` / `new_value` で、こちらは
 * **JSON null が「その項目が null になった」という実値**。だから自由形式にする。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: すべての `Json` 列が array / object / 自由形式のどれかに分類され、
 * array と object は対応する CHECK が invariants.sql に実在する。
 *
 * **証明しない**: object の中身（キーの有無・型）。そこは Zod の領分で、
 * DB に持たせると schema 変更のたびに migration が要る。
 */

import { describe, expect, test } from "bun:test";

import {
  readDatabaseInvariants,
  readPrismaSchema,
} from "../../support/prisma-sources";

interface JsonColumn {
  readonly model: string;
  readonly field: string;
  readonly table: string;
  readonly column: string;
}

function snakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

function readJsonColumns(): JsonColumn[] {
  const lines = readPrismaSchema().split(/\r?\n/u);

  const tableOf = new Map<string, string>();
  {
    let model: string | null = null;
    for (const raw of lines) {
      const line = raw.replace(/\/\/.*$/u, "");
      const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
      if (open?.[1]) {
        model = open[1];
        tableOf.set(model, model);
        continue;
      }
      if (/^\s*\}/u.test(line)) {
        model = null;
        continue;
      }
      if (!model) continue;
      const mapped = /@@map\("([^"]+)"\)/u.exec(line);
      if (mapped?.[1]) tableOf.set(model, mapped[1]);
    }
  }

  const out: JsonColumn[] = [];
  let model: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;

    const decl = /^\s*(\w+)\s+Json(\[\])?\??\s*(.*)$/u.exec(line);
    if (!decl?.[1] || decl[2] === "[]") continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(decl[3] ?? "")?.[1];

    out.push({
      model,
      field: decl[1],
      table: tableOf.get(model) ?? model,
      column: mapped ?? snakeCase(decl[1]),
    });
  }
  return out;
}

const COLUMNS = readJsonColumns();

/** `Model.field` → 期待する形状。 */
type Shape = "array" | "object" | "free-form";

const SHAPES: Readonly<Record<string, Shape>> = {
  // --- 要素の並び ---------------------------------------------------------
  "AnnouncementBar.message": "array",
  "Event.gallery": "array",
  "Location.accessLines": "array",
  "Location.imageUrls": "array",
  "Location.specialHolidays": "array",
  "Media.tags": "array",
  "NavigationItem.label": "array",
  "SettingsCommerce.durationDiscountRules": "array",
  "SettingsSidebar.sidebarWidgets": "array",
  "Space.facilities": "array",
  "Space.gallery": "array",
  // 同意した規約の一覧（`AgreementSnapshotEntry[]`）。
  "ReservationSeries.agreementSnapshot": "array",

  // --- キーつきの構造 -----------------------------------------------------
  "AuditLog.metadata": "object",
  "BlockTemplate.nodeJson": "object",
  "Event.descriptionJson": "object",
  "Location.amenities": "object",
  "Location.businessHours": "object",
  "News.contentJson": "object",
  "Post.contentJson": "object",
  "Receipt.issuerSnapshot": "object",

  "ReservationSeries.templateData": "object",
  "Reservation.rateBreakdownJson": "object",
  "Section.config": "object",
  "SettingsCommerce.refundPolicy": "object",
  "SettingsDataRetention.dataRetention": "object",
  "SettingsFeatures.featureModules": "object",
  "SettingsGoogleBusinessProfile.googleBusinessProfileAuth": "object",
  "SettingsOrganization.businessHours": "object",
  "Space.businessHours": "object",
  "Space.descriptionJson": "object",
  "TermsDocument.contentJson": "object",

  // --- 自由形式 -----------------------------------------------------------
  //
  // 監査ログの旧値/新値は**その項目が持っていた値そのもの**。文字列にも数値にも
  // JSON null にもなる（「null になった」という変更を記録するため）。
  // 形状を決められないのが正しいので、制約を置かない。
  "AuditLog.oldValue": "free-form",
  "AuditLog.newValue": "free-form",
};

/** invariants.sql の CHECK（制約名 → 式）。 */
function checkExpressions(): Map<string, string> {
  const out = new Map<string, string>();
  const pattern =
    /ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "([a-z_]+)" CHECK \((.*)\);/gu;
  for (const m of readDatabaseInvariants().matchAll(pattern)) {
    if (m[2] && m[3]) out.set(m[2], `${m[1] ?? ""}|${m[3]}`);
  }
  return out;
}

const CHECKS = checkExpressions();

function key(c: JsonColumn): string {
  return `${c.model}.${c.field}`;
}

/** その列に `jsonb_typeof(...) = '<shape>'` の CHECK があるか。 */
function hasShapeCheck(c: JsonColumn, shape: "array" | "object"): boolean {
  const columnRef = new RegExp(
    `jsonb_typeof\\(\\(?"?${c.column}"?\\)?\\)`,
    "u",
  );
  for (const entry of CHECKS.values()) {
    const [table, expression] = entry.split("|");
    if (table !== c.table || expression === undefined) continue;
    if (columnRef.test(expression) && expression.includes(`'${shape}'`)) {
      return true;
    }
  }
  return false;
}

describe("Json 列の形状", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // パースが壊れると以降が全部 vacuous に通る。
    expect(COLUMNS.length).toBeGreaterThan(25);
    expect(CHECKS.size).toBeGreaterThan(100);
    // 既知の列で物理名の導出を固定する。
    const breakdown = COLUMNS.find(
      (c) => key(c) === "Reservation.rateBreakdownJson",
    );
    expect(breakdown?.column).toBe("rate_breakdown_json");
    expect(breakdown && hasShapeCheck(breakdown, "object")).toBe(true);
  });

  test("すべての Json 列が形状を宣言している", () => {
    const undeclared = COLUMNS.filter((c) => !(key(c) in SHAPES)).map(
      (c) =>
        `${key(c)} (${c.table}.${c.column}): 形状が宣言されていない。` +
        `array / object / free-form のどれかを決める`,
    );

    expect(undeclared).toEqual([]);
  });

  test("array / object と宣言した列は CHECK が実在する", () => {
    const missing = COLUMNS.flatMap((c) => {
      const shape = SHAPES[key(c)];
      if (shape === undefined || shape === "free-form") return [];
      return hasShapeCheck(c, shape)
        ? []
        : [`${key(c)}: jsonb_typeof(${c.column}) = '${shape}' の CHECK が無い`];
    });

    expect(missing).toEqual([]);
  });

  test("宣言に実在しない列が残っていない", () => {
    const known = new Set(COLUMNS.map(key));
    const stale = Object.keys(SHAPES).filter((k) => !known.has(k));

    expect(stale).toEqual([]);
  });

  test("自由形式は監査ログの旧値/新値だけ", () => {
    // 「決められない」は逃げ場になりやすいので、名指しで固定する。
    const freeForm = Object.entries(SHAPES)
      .filter(([, shape]) => shape === "free-form")
      .map(([k]) => k)
      .sort();

    expect(freeForm).toEqual(["AuditLog.newValue", "AuditLog.oldValue"]);
  });
});
