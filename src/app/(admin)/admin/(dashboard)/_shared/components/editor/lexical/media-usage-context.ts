/**
 * Media Usage Context
 *
 * @description LexicalEditor 内の画像/音声/ファイル挿入ダイアログ（ImageDropPlugin の
 * drag&drop アップロード、ImagePlugin 等の MediaPickerDialog 経由アップロード）が
 * 付与する MediaUsage を、editor 呼び出し元（Post/News/Event/Space/Terms 編集フォーム等）
 * から一元的に受け取るための Context。
 *
 * LexicalEditor の props（mediaUsage）が指定されない場合は既存挙動と互換の
 * DEFAULT_MEDIA_USAGE にフォールバックする。
 */

"use client";

import { createContext, use } from "react";
import type { MediaUsage } from "@/admin/lib/validations/media";

/** LexicalEditor に mediaUsage が渡されない場合の既定値（既存のハードコード挙動と互換） */
export const DEFAULT_MEDIA_USAGE: MediaUsage = "POST";

export const MediaUsageContext = createContext<MediaUsage | undefined>(
  undefined,
);

/**
 * 現在の編集コンテキストにおける MediaUsage を取得する。
 * Provider が無い場合（テスト等）は DEFAULT_MEDIA_USAGE を返す。
 */
export function useMediaUsage(): MediaUsage {
  const usage = use(MediaUsageContext);
  return usage ?? DEFAULT_MEDIA_USAGE;
}
