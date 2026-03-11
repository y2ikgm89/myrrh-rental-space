import { z } from "zod";

/** フィールド定義（管理画面フォームの自動生成用） */
export type FieldDefinition = {
  readonly name: string;
  readonly label: string;
  readonly fieldType: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly enumValues?: readonly string[];
  readonly placeholder?: string;
  readonly visibleWhen?: {
    readonly field: string;
    readonly value: string | boolean;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isVisibleWhen(
  value: unknown,
): value is { field: string; value: string | boolean } {
  if (!isRecord(value)) return false;
  if (typeof value["field"] !== "string") return false;
  const val = value["value"];
  return typeof val === "string" || typeof val === "boolean";
}

/**
 * JSON Schema のプロパティ定義から fieldType を推論する。
 * meta() に fieldType が指定されている場合はそちらを優先する。
 */
function inferFieldType(prop: Record<string, unknown>): string {
  // meta() に fieldType が指定されている場合は優先
  if (typeof prop["fieldType"] === "string") {
    return prop["fieldType"];
  }

  const type = prop["type"];

  // enum がある場合は select
  if (Array.isArray(prop["enum"])) {
    return "select";
  }

  if (type === "boolean") return "switch";
  if (type === "number" || type === "integer") return "number";

  return "text";
}

/**
 * Zod スキーマから FieldDefinition[] を抽出する。
 * `.meta()` に埋め込まれた UI ヒントを JSON Schema 経由で取得する。
 *
 * @param schema - z.ZodType（z.object 以外は空配列を返す）
 */
export function extractFieldDefinitions(schema: z.ZodType): FieldDefinition[] {
  const jsonSchema = z.toJSONSchema(schema);

  if (!isRecord(jsonSchema)) return [];

  const properties = jsonSchema["properties"];
  if (!isRecord(properties)) return [];

  const requiredFields = jsonSchema["required"];
  const requiredSet = new Set<string>(
    isStringArray(requiredFields) ? requiredFields : [],
  );

  const fields: FieldDefinition[] = [];

  for (const [name, rawProp] of Object.entries(properties)) {
    if (!isRecord(rawProp)) continue;

    const description = rawProp["description"];
    const label = typeof description === "string" ? description : name;

    const fieldType = inferFieldType(rawProp);

    const min =
      typeof rawProp["minimum"] === "number" ? rawProp["minimum"] : undefined;
    const max =
      typeof rawProp["maximum"] === "number" ? rawProp["maximum"] : undefined;
    const enumValues = isStringArray(rawProp["enum"])
      ? rawProp["enum"]
      : undefined;
    const placeholder =
      typeof rawProp["placeholder"] === "string"
        ? rawProp["placeholder"]
        : undefined;
    const visibleWhen = isVisibleWhen(rawProp["visibleWhen"])
      ? rawProp["visibleWhen"]
      : undefined;

    const field: FieldDefinition = {
      name,
      label,
      fieldType,
      required: requiredSet.has(name),
      ...(rawProp["default"] !== undefined
        ? { defaultValue: rawProp["default"] }
        : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(enumValues !== undefined ? { enumValues } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(visibleWhen !== undefined ? { visibleWhen } : {}),
    };

    fields.push(field);
  }

  return fields;
}
