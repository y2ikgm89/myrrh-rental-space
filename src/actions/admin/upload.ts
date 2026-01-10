'use server'

import {
  uploadSpaceImage,
  uploadBlogImage,
  uploadSiteImage,
  deleteFile,
  deleteFiles,
  extractPathFromUrl,
  type UploadResult,
} from '@/lib/storage'
import { STORAGE_BUCKETS } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

// =============================================================================
// Types
// =============================================================================

export type UploadActionResult = {
  success: boolean
  url?: string
  error?: string
}

// =============================================================================
// Space Image Actions
// =============================================================================

/**
 * スペース画像をアップロード
 */
export async function uploadSpaceImageAction(
  formData: FormData,
  spaceId: string
): Promise<UploadActionResult> {
  try {
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const result = await uploadSpaceImage(file, spaceId)

    if (result.success) {
      revalidatePath('/admin/spaces')
      revalidatePath(`/admin/spaces/${spaceId}`)
    }

    return {
      success: result.success,
      url: result.url,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to upload space image:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * 複数のスペース画像をアップロード
 */
export async function uploadSpaceImagesAction(
  formData: FormData,
  spaceId: string
): Promise<{ success: boolean; urls?: string[]; error?: string }> {
  try {
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const urls: string[] = []
    for (const file of files) {
      const result = await uploadSpaceImage(file, spaceId)
      if (!result.success) {
        return { success: false, error: result.error }
      }
      if (result.url) {
        urls.push(result.url)
      }
    }

    revalidatePath('/admin/spaces')
    revalidatePath(`/admin/spaces/${spaceId}`)

    return { success: true, urls }
  } catch (error) {
    console.error('Failed to upload space images:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * スペース画像を削除
 */
export async function deleteSpaceImageAction(
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const path = extractPathFromUrl(imageUrl, STORAGE_BUCKETS.SPACES)
    if (!path) {
      return { success: false, error: '無効な画像URLです' }
    }

    return await deleteFile(path, STORAGE_BUCKETS.SPACES)
  } catch (error) {
    console.error('Failed to delete space image:', error)
    return { success: false, error: '削除に失敗しました' }
  }
}

// =============================================================================
// Blog Image Actions
// =============================================================================

/**
 * ブログ画像をアップロード
 */
export async function uploadBlogImageAction(
  formData: FormData,
  postId?: string
): Promise<UploadActionResult> {
  try {
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const result = await uploadBlogImage(file, postId)

    if (result.success && postId) {
      revalidatePath('/admin/blog')
      revalidatePath(`/admin/blog/${postId}`)
    }

    return {
      success: result.success,
      url: result.url,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to upload blog image:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * ブログ画像を削除
 */
export async function deleteBlogImageAction(
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const path = extractPathFromUrl(imageUrl, STORAGE_BUCKETS.BLOG)
    if (!path) {
      return { success: false, error: '無効な画像URLです' }
    }

    return await deleteFile(path, STORAGE_BUCKETS.BLOG)
  } catch (error) {
    console.error('Failed to delete blog image:', error)
    return { success: false, error: '削除に失敗しました' }
  }
}

// =============================================================================
// Site Image Actions
// =============================================================================

/**
 * サイトロゴをアップロード
 */
export async function uploadLogoAction(
  formData: FormData
): Promise<UploadActionResult> {
  try {
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const result = await uploadSiteImage(file, 'logo')

    if (result.success) {
      revalidatePath('/admin/settings')
      revalidatePath('/')
    }

    return {
      success: result.success,
      url: result.url,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to upload logo:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * ファビコンをアップロード
 */
export async function uploadFaviconAction(
  formData: FormData
): Promise<UploadActionResult> {
  try {
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const result = await uploadSiteImage(file, 'favicon')

    if (result.success) {
      revalidatePath('/admin/settings')
      revalidatePath('/')
    }

    return {
      success: result.success,
      url: result.url,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to upload favicon:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * OGP画像をアップロード
 */
export async function uploadOgpImageAction(
  formData: FormData
): Promise<UploadActionResult> {
  try {
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'ファイルが選択されていません' }
    }

    const result = await uploadSiteImage(file, 'ogp')

    if (result.success) {
      revalidatePath('/admin/settings')
    }

    return {
      success: result.success,
      url: result.url,
      error: result.error,
    }
  } catch (error) {
    console.error('Failed to upload OGP image:', error)
    return { success: false, error: 'アップロードに失敗しました' }
  }
}

/**
 * サイト画像を削除
 */
export async function deleteSiteImageAction(
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const path = extractPathFromUrl(imageUrl, STORAGE_BUCKETS.SITE)
    if (!path) {
      return { success: false, error: '無効な画像URLです' }
    }

    const result = await deleteFile(path, STORAGE_BUCKETS.SITE)

    if (result.success) {
      revalidatePath('/admin/settings')
      revalidatePath('/')
    }

    return result
  } catch (error) {
    console.error('Failed to delete site image:', error)
    return { success: false, error: '削除に失敗しました' }
  }
}

// =============================================================================
// Batch Delete Actions
// =============================================================================

/**
 * 複数のスペース画像を一括削除
 */
export async function deleteSpaceImagesAction(
  imageUrls: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (imageUrls.length === 0) {
      return { success: true }
    }

    const paths: string[] = []
    for (const url of imageUrls) {
      const path = extractPathFromUrl(url, STORAGE_BUCKETS.SPACES)
      if (path) {
        paths.push(path)
      }
    }

    if (paths.length === 0) {
      return { success: false, error: '有効な画像URLがありません' }
    }

    return await deleteFiles(paths, STORAGE_BUCKETS.SPACES)
  } catch (error) {
    console.error('Failed to delete space images:', error)
    return { success: false, error: '削除に失敗しました' }
  }
}

/**
 * 複数のブログ画像を一括削除
 */
export async function deleteBlogImagesAction(
  imageUrls: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (imageUrls.length === 0) {
      return { success: true }
    }

    const paths: string[] = []
    for (const url of imageUrls) {
      const path = extractPathFromUrl(url, STORAGE_BUCKETS.BLOG)
      if (path) {
        paths.push(path)
      }
    }

    if (paths.length === 0) {
      return { success: false, error: '有効な画像URLがありません' }
    }

    return await deleteFiles(paths, STORAGE_BUCKETS.BLOG)
  } catch (error) {
    console.error('Failed to delete blog images:', error)
    return { success: false, error: '削除に失敗しました' }
  }
}

// Re-export UploadResult type for consumers
export type { UploadResult }
