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

/**
 * UUID 形式のエンティティ ID スキーマファクトリ。
 *
 * 管理 action / query / route handler で個別に宣言されていた
 * `z.uuid({ error: "XXX IDが不正です" })` を集約し、エラー文言の
 * 揺れ（"IDが不正です" / "ユーザーIDが不正です" 等）を構造的に解消する。
 *
 * @param entityLabel エラーメッセージの先頭に付与するエンティティ名（例: "クーポン"）
 */
export function uuidIdSchema(entityLabel: string) {
  return z.uuid({ error: `${entityLabel}IDが不正です` });
}

/**
 * Prisma `@default(cuid())` の String ID スキーマファクトリ。
 *
 * イベント系モデルなど、DB schema 上 `@db.VarChar(30)` + `cuid()` を使う
 * ID では UUID 検証を使わない。
 */
export function prismaCuidIdSchema(entityLabel: string) {
  return z.cuid({ error: `${entityLabel}IDが不正です` });
}

/**
 * Prisma `@default(cuid(2))` の String ID スキーマファクトリ。
 */
export function prismaCuid2IdSchema(entityLabel: string) {
  return z.cuid2({ error: `${entityLabel}IDが不正です` });
}
