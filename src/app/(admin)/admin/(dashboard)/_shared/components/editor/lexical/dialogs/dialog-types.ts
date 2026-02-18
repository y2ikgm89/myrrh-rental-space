/**
 * Dialog Types
 *
 * @description ダイアログIDの型定義（REGISTRY_DIALOG_IDS + BlockTemplate独自ダイアログから導出）
 */

import { REGISTRY_DIALOG_IDS, type RegistryDialogId } from '../config/dialog-registry'

/**
 * BlockTemplatePlugin は独自の props パターン（isSaveOpen/isInsertOpen）を使用するため
 * DIALOG_REGISTRY には含まれない。ここで追加定義する。
 */
const BLOCK_TEMPLATE_DIALOG_IDS = ['blockTemplateSave', 'blockTemplateInsert'] as const

type BlockTemplateDialogId = (typeof BLOCK_TEMPLATE_DIALOG_IDS)[number]

export const DIALOG_IDS = [
  ...REGISTRY_DIALOG_IDS,
  ...BLOCK_TEMPLATE_DIALOG_IDS,
] as const

export type DialogId = RegistryDialogId | BlockTemplateDialogId
