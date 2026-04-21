/**
 * ファイルストレージサービス
 *
 * NOTE: Supabase Storage から Cloudflare R2 への移行中。
 * このファイルは Bundle D（R2 ストレージ配線）で R2 実装に置き換えられます。
 *
 * @module shared/lib/storage
 */

import { STORAGE_BUCKETS, type StorageBucket } from "./supabase";

export type { StorageBucket };
export { STORAGE_BUCKETS };

// =============================================================================
// Types
// =============================================================================

export type UploadResult = {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
};

export type FileValidation = {
  maxSize: number; // bytes
  allowedTypes: string[];
};

// =============================================================================
// Constants
// =============================================================================

const STORAGE_NOT_CONFIGURED_ERROR =
  "ファイルアップロード機能はR2移行中のため一時的に利用できません";

// =============================================================================
// Upload Functions
// =============================================================================

/**
 * 単一ファイルをアップロード
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function uploadFile(
  _file: File,
  _bucket: StorageBucket,
  _options?: {
    folder?: string;
    validation?: FileValidation;
  },
): Promise<UploadResult> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

/**
 * 複数ファイルをアップロード
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function uploadFiles(
  _files: File[],
  _bucket: StorageBucket,
  _options?: {
    folder?: string;
    validation?: FileValidation;
  },
): Promise<{ success: boolean; results: UploadResult[]; error?: string }> {
  return {
    success: false,
    results: [],
    error: STORAGE_NOT_CONFIGURED_ERROR,
  };
}

/**
 * ファイルを削除
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function deleteFile(
  _path: string,
  _bucket: StorageBucket,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

/**
 * 複数ファイルを削除
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function deleteFiles(
  _paths: string[],
  _bucket: StorageBucket,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

// =============================================================================
// Specialized Upload Functions
// =============================================================================

/**
 * スペース画像をアップロード
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function uploadSpaceImage(
  _file: File,
  _spaceId: string,
): Promise<UploadResult> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

/**
 * 投稿画像をアップロード
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function uploadPostImage(
  _file: File,
  _postId?: string,
): Promise<UploadResult> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

/**
 * サイト画像（ロゴ・ファビコン）をアップロード
 * NOTE: R2 移行中のため常にエラーを返します
 */
export async function uploadSiteImage(
  _file: File,
  _type: "logo" | "favicon" | "ogp",
): Promise<UploadResult> {
  return { success: false, error: STORAGE_NOT_CONFIGURED_ERROR };
}

// =============================================================================
// URL Helpers
// =============================================================================

/**
 * ストレージ URL からパスを抽出
 * NOTE: R2 移行後は R2 URL フォーマットに合わせて更新予定
 */
export function extractPathFromUrl(
  _url: string,
  _bucket: StorageBucket,
): string | null {
  return null;
}

/**
 * パスから公開 URL を生成
 * NOTE: R2 移行後は R2 公開 URL フォーマットに合わせて更新予定
 */
export function getPublicUrl(
  _path: string,
  _bucket: StorageBucket,
): string | null {
  return null;
}
