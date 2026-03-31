/**
 * Config Form Registry
 *
 * 全セクションタイプは AutoSectionForm で自動生成される。
 * AutoSectionForm はセクション定義レジストリから Zod スキーマを取得し、
 * FieldMeta メタデータを読み取って UI を自動レンダリングする。
 */

import type { ComponentType } from "react";

import { AutoSectionForm } from "../auto-section-form";
import type { ConfigFormProps, ConfigFormSavePayload } from "./shared";

export type { ConfigFormProps, ConfigFormSavePayload };
export { FormActions } from "./shared";

/**
 * セクションタイプに対応するフォームコンポーネントを取得する。
 * 全タイプが AutoSectionForm を使用する。
 */
export function getConfigForm(_type: string): ComponentType<ConfigFormProps> {
  return AutoSectionForm;
}
