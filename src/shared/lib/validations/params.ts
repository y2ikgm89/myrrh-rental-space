/**
 * 読み取り専用関数のパラメータバリデーション
 *
 * 'use cache' 関数の入口でユーザー入力（URLスラッグ、ID等）を検証。
 * 防御的プログラミング: 不正な入力をDB到達前にブロック。
 */

import { z } from "zod";

/**
 * URL スラッグ正規表現の SSoT。
 * 小文字英数字 + 単一ハイフン区切り（先頭/末尾/連続ハイフンを許さない）。
 * 読み取り側パラメータ検証（slugParamSchema）に加え、書き込み側フォーム検証
 * （page / location）と CreatePageDialog の client 即時検証も本定数を参照する。
 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * URLスラッグパラメータ（小文字英数字 + ハイフン、1-100文字）
 */
export const slugParamSchema = z.string().min(1).max(100).regex(SLUG_REGEX);

/**
 * エンティティIDパラメータ（CUID等、1-100文字）
 */
export const idParamSchema = z.string().min(1).max(100);
