"use client";

/**
 * AutoArrayField — conform getFieldList ベースの配列フィールドリピーター
 *
 * form.insert/remove.getButtonProps で追加/削除を制御する。子フィールドのレンダリング
 * は renderField prop で受け取り、auto-section-form の AutoFieldByType に委譲する。
 */

import type { ReactNode } from "react";
import type { z } from "zod";
import type { FieldMetadata, FormMetadata } from "@conform-to/react";

import { Button, Card, CardContent, Label } from "@/admin/components/ui";
import {
  getTypedFieldList,
  getTypedFieldset,
} from "@/shared/lib/conform/typed-input-control";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  getArrayConstraints,
  getArrayItemShape,
  extractFieldMetaDeep,
} from "../zod-introspection";
import type { ArrayItemFieldInfo } from "../zod-introspection";

export function AutoArrayField<TForm extends Record<string, unknown>>({
  field,
  form,
  label,
  helpText,
  schema,
  isPending,
  renderField,
}: {
  readonly field: FieldMetadata<unknown, TForm>;
  readonly form: FormMetadata<TForm>;
  readonly label: string;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  readonly isPending: boolean;
  readonly renderField: (
    info: ArrayItemFieldInfo,
    subField: FieldMetadata<unknown, TForm>,
    defaultValue: unknown,
  ) => ReactNode;
}) {
  const itemShape = getArrayItemShape(schema);
  const itemFields: ArrayItemFieldInfo[] = itemShape
    ? Object.entries(itemShape).map(([k, s]) => ({
        key: k,
        schema: s,
        meta: extractFieldMetaDeep(s),
      }))
    : [];

  // schema 由来の min / max 制約（field.array({ min, max }) で登録されたもの）
  const { min, max } = getArrayConstraints(schema);

  // conform: per-item アクセサ（各 item は FieldMetadata、getFieldset() で子フィールドを取得）
  const items = getTypedFieldList(field);
  const canAdd = max === undefined || items.length < max;
  const canRemove = min === undefined || items.length > min;

  const constraintHint = (() => {
    if (min !== undefined && max !== undefined) {
      return min === max ? `${min}件必須` : `${min}〜${max}件`;
    }
    if (max !== undefined) return `最大${max}件`;
    if (min !== undefined) return `最低${min}件`;
    return null;
  })();

  // 新しいアイテムのデフォルト値を生成
  // - boolean / number は空文字列で初期化 (schema preprocess が default 適用に委ねる)
  // - portable-text 系は空配列
  // - その他 string 系は空文字列
  const createEmptyItem = (): Record<string, string | null | undefined> => {
    const empty: Record<string, string | null | undefined> = {};
    for (const f of itemFields) {
      if (f.meta) {
        switch (f.meta.fieldType) {
          case "portable-text-inline":
          case "portable-text-block":
            empty[f.key] = "";
            break;
          default:
            empty[f.key] = "";
        }
      } else {
        empty[f.key] = "";
      }
    }
    return empty;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <Label>{label}</Label>
          {constraintHint ? (
            <span className="text-xs text-muted-foreground">
              ({constraintHint})
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const fieldName: string = field.name;
            form.insert<Record<string, string | null | undefined>[]>({
              name: fieldName,
              defaultValue: createEmptyItem(),
            });
          }}
          disabled={isPending || !canAdd}
          aria-label={
            !canAdd && max !== undefined
              ? `最大 ${max} 件のため追加できません`
              : undefined
          }
        >
          <IconPlus className="h-3 w-3 mr-1" />
          追加
        </Button>
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {items.length === 0 && (
        <div className="flex items-center justify-center py-8 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">
            アイテムが追加されていません
          </p>
        </div>
      )}
      {items.map((itemField, index) => {
        const itemFieldset = getTypedFieldset(itemField);
        return (
          <Card key={itemField.key}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">#{index + 1}</p>
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="sm"
                  onClick={() => {
                    const fieldName: string = field.name;
                    form.remove<Record<string, string | null | undefined>[]>({
                      name: fieldName,
                      index,
                    });
                  }}
                  disabled={isPending || !canRemove}
                  aria-label={
                    !canRemove && min !== undefined
                      ? `最低 ${min} 件必要なため削除できません`
                      : undefined
                  }
                >
                  <IconTrash className="h-3 w-3" />
                </Button>
              </div>
              {itemFields.map((itemFieldInfo) => {
                if (!itemFieldInfo.meta) return null;
                const subFieldMeta = itemFieldset[itemFieldInfo.key];
                if (!subFieldMeta) return null;
                return (
                  <div key={itemFieldInfo.key}>
                    {renderField(itemFieldInfo, subFieldMeta, undefined)}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
