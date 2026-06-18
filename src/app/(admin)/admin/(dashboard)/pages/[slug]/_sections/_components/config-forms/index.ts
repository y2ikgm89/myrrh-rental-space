/**
 * Config form 共有エクスポート
 *
 * 全セクションタイプは AutoSectionForm（セクション定義レジストリから Zod スキーマ /
 * FieldMeta を読み取り UI を自動レンダリング）で扱う。型ごとにフォームを出し分ける
 * レジストリ（旧 getConfigForm = 引数を無視し常に AutoSectionForm を返す vestigial 実装）は
 * 単一実装へ集約され不要になったため撤去した。
 */

import type { ConfigFormProps, ConfigFormSavePayload } from "./shared";

export type { ConfigFormProps, ConfigFormSavePayload };
export { FormActions } from "./shared";
