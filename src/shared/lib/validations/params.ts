/**
 * 読み取り専用関数のパラメータバリデーション
 *
 * 'use cache' 関数の入口でユーザー入力（URLスラッグ、ID等）を検証。
 * 防御的プログラミング: 不正な入力をDB到達前にブロック。
 */

import { z } from "zod";

/**
 * URLスラッグパラメータ（小文字英数字 + ハイフン、1-100文字）
 */
export const slugParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * エンティティIDパラメータ（CUID等、1-100文字）
 */
export const idParamSchema = z.string().min(1).max(100);
