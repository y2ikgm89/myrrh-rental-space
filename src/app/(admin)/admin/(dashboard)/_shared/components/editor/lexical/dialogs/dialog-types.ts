/**
 * Dialog Types
 *
 * @description ダイアログIDの型定義（REGISTRY_DIALOG_IDS + BlockTemplate独自ダイアログから導出）
 */

import { type RegistryDialogId } from "../config/dialog-registry";

/**
 * BlockTemplatePlugin は独自の props パターン（isSaveOpen/isInsertOpen）を使用するため
 * DIALOG_REGISTRY には含まれない。ここで追加定義する。
 */
type BlockTemplateDialogId = "blockTemplateSave" | "blockTemplateInsert";

export type DialogId = RegistryDialogId | BlockTemplateDialogId;
