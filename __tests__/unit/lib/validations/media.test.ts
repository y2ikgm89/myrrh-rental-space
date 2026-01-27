/**
 * メディアバリデーションテスト
 *
 * src/lib/validations/media.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  mediaUploadSchema,
  mediaUpdateSchema,
  mediaFiltersSchema,
  mediaPaginationSchema,
  inferMediaType,
  isAllowedMimeType,
  isAllowedFileSize,
  MAX_FILE_SIZES,
  ALLOWED_MIME_TYPES,
} from '@/admin/lib/validations/media'

describe('mediaUploadSchema', () => {
  describe('正常系', () => {
    test('最小限のデータは検証を通過', () => {
      const result = mediaUploadSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('IMAGE')
        expect(result.data.usage).toBe('GENERAL')
        expect(result.data.tags).toEqual([])
      }
    })

    test('全フィールド指定も許可', () => {
      const result = mediaUploadSchema.safeParse({
        type: 'VIDEO',
        usage: 'POST',
        alt: '代替テキスト',
        title: 'タイトル',
        description: '説明',
        tags: ['tag1', 'tag2'],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('type', () => {
    test('有効なMediaType値は許可', () => {
      const validTypes = ['IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER']

      for (const type of validTypes) {
        const result = mediaUploadSchema.safeParse({ type })
        expect(result.success).toBe(true)
      }
    })

    test('無効なtype値はエラー', () => {
      const result = mediaUploadSchema.safeParse({ type: 'INVALID' })
      expect(result.success).toBe(false)
    })
  })

  describe('usage', () => {
    test('有効なMediaUsage値は許可', () => {
      const validUsages = ['GENERAL', 'POST', 'SPACE', 'NEWS', 'PAGE', 'SITE']

      for (const usage of validUsages) {
        const result = mediaUploadSchema.safeParse({ usage })
        expect(result.success).toBe(true)
      }
    })

    test('無効なusage値はエラー', () => {
      const result = mediaUploadSchema.safeParse({ usage: 'INVALID' })
      expect(result.success).toBe(false)
    })
  })

  describe('alt', () => {
    test('200文字超過はエラー', () => {
      const result = mediaUploadSchema.safeParse({ alt: 'あ'.repeat(201) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200文字以内')
      }
    })

    test('200文字ちょうどは許可', () => {
      const result = mediaUploadSchema.safeParse({ alt: 'あ'.repeat(200) })
      expect(result.success).toBe(true)
    })
  })

  describe('title', () => {
    test('100文字超過はエラー', () => {
      const result = mediaUploadSchema.safeParse({ title: 'あ'.repeat(101) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('100文字ちょうどは許可', () => {
      const result = mediaUploadSchema.safeParse({ title: 'あ'.repeat(100) })
      expect(result.success).toBe(true)
    })
  })

  describe('description', () => {
    test('500文字超過はエラー', () => {
      const result = mediaUploadSchema.safeParse({ description: 'あ'.repeat(501) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500文字以内')
      }
    })

    test('500文字ちょうどは許可', () => {
      const result = mediaUploadSchema.safeParse({ description: 'あ'.repeat(500) })
      expect(result.success).toBe(true)
    })
  })

  describe('tags', () => {
    test('空配列は許可', () => {
      const result = mediaUploadSchema.safeParse({ tags: [] })
      expect(result.success).toBe(true)
    })

    test('11個以上はエラー', () => {
      const result = mediaUploadSchema.safeParse({
        tags: Array(11).fill('tag'),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('最大10個')
      }
    })

    test('50文字超過のタグはエラー', () => {
      const result = mediaUploadSchema.safeParse({
        tags: ['a'.repeat(51)],
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('50文字以内')
      }
    })
  })
})

describe('mediaUpdateSchema', () => {
  describe('正常系', () => {
    test('空オブジェクトは許可', () => {
      const result = mediaUpdateSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    test('全フィールド指定も許可', () => {
      const result = mediaUpdateSchema.safeParse({
        alt: '代替テキスト',
        title: 'タイトル',
        description: '説明',
        tags: ['tag1'],
        usage: 'POST',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('alt', () => {
    test('200文字超過はエラー', () => {
      const result = mediaUpdateSchema.safeParse({ alt: 'あ'.repeat(201) })
      expect(result.success).toBe(false)
    })
  })

  describe('title', () => {
    test('100文字超過はエラー', () => {
      const result = mediaUpdateSchema.safeParse({ title: 'あ'.repeat(101) })
      expect(result.success).toBe(false)
    })
  })

  describe('description', () => {
    test('500文字超過はエラー', () => {
      const result = mediaUpdateSchema.safeParse({ description: 'あ'.repeat(501) })
      expect(result.success).toBe(false)
    })
  })

  describe('tags', () => {
    test('11個以上はエラー', () => {
      const result = mediaUpdateSchema.safeParse({
        tags: Array(11).fill('tag'),
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('mediaFiltersSchema', () => {
  test('空オブジェクトは許可', () => {
    const result = mediaFiltersSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('全フィールド指定も許可', () => {
    const result = mediaFiltersSchema.safeParse({
      type: 'IMAGE',
      usage: 'POST',
      search: 'keyword',
      mimeType: 'image/jpeg',
    })
    expect(result.success).toBe(true)
  })

  test('無効なtype値はエラー', () => {
    const result = mediaFiltersSchema.safeParse({ type: 'INVALID' })
    expect(result.success).toBe(false)
  })

  test('無効なusage値はエラー', () => {
    const result = mediaFiltersSchema.safeParse({ usage: 'INVALID' })
    expect(result.success).toBe(false)
  })
})

describe('mediaPaginationSchema', () => {
  test('空オブジェクトはデフォルト値が適用', () => {
    const result = mediaPaginationSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(24)
    }
  })

  test('page 0はエラー', () => {
    const result = mediaPaginationSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  test('limit 0はエラー', () => {
    const result = mediaPaginationSchema.safeParse({ limit: 0 })
    expect(result.success).toBe(false)
  })

  test('limit 101はエラー', () => {
    const result = mediaPaginationSchema.safeParse({ limit: 101 })
    expect(result.success).toBe(false)
  })

  test('有効な値は許可', () => {
    const result = mediaPaginationSchema.safeParse({ page: 5, limit: 50 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(5)
      expect(result.data.limit).toBe(50)
    }
  })
})

describe('inferMediaType', () => {
  test('image/* は IMAGE を返す', () => {
    expect(inferMediaType('image/jpeg')).toBe('IMAGE')
    expect(inferMediaType('image/png')).toBe('IMAGE')
    expect(inferMediaType('image/webp')).toBe('IMAGE')
    expect(inferMediaType('image/gif')).toBe('IMAGE')
  })

  test('video/* は VIDEO を返す', () => {
    expect(inferMediaType('video/mp4')).toBe('VIDEO')
    expect(inferMediaType('video/webm')).toBe('VIDEO')
  })

  test('application/pdf は DOCUMENT を返す', () => {
    expect(inferMediaType('application/pdf')).toBe('DOCUMENT')
  })

  test('その他は OTHER を返す', () => {
    expect(inferMediaType('application/json')).toBe('OTHER')
    expect(inferMediaType('text/plain')).toBe('OTHER')
  })
})

describe('isAllowedMimeType', () => {
  describe('IMAGE', () => {
    test('許可されたMIMEタイプはtrue', () => {
      expect(isAllowedMimeType('image/jpeg', 'IMAGE')).toBe(true)
      expect(isAllowedMimeType('image/png', 'IMAGE')).toBe(true)
      expect(isAllowedMimeType('image/webp', 'IMAGE')).toBe(true)
      expect(isAllowedMimeType('image/gif', 'IMAGE')).toBe(true)
      expect(isAllowedMimeType('image/svg+xml', 'IMAGE')).toBe(true)
    })

    test('許可されていないMIMEタイプはfalse', () => {
      expect(isAllowedMimeType('image/bmp', 'IMAGE')).toBe(false)
      expect(isAllowedMimeType('video/mp4', 'IMAGE')).toBe(false)
    })
  })

  describe('VIDEO', () => {
    test('許可されたMIMEタイプはtrue', () => {
      expect(isAllowedMimeType('video/mp4', 'VIDEO')).toBe(true)
      expect(isAllowedMimeType('video/webm', 'VIDEO')).toBe(true)
      expect(isAllowedMimeType('video/quicktime', 'VIDEO')).toBe(true)
    })

    test('許可されていないMIMEタイプはfalse', () => {
      expect(isAllowedMimeType('video/avi', 'VIDEO')).toBe(false)
    })
  })

  describe('DOCUMENT', () => {
    test('許可されたMIMEタイプはtrue', () => {
      expect(isAllowedMimeType('application/pdf', 'DOCUMENT')).toBe(true)
    })

    test('許可されていないMIMEタイプはfalse', () => {
      expect(isAllowedMimeType('application/msword', 'DOCUMENT')).toBe(false)
    })
  })

  describe('OTHER', () => {
    test('OTHERは全てのMIMEタイプを許可（空配列のため）', () => {
      expect(isAllowedMimeType('anything', 'OTHER')).toBe(true)
    })
  })

  describe('type指定なし', () => {
    test('MIMEタイプから自動推定', () => {
      expect(isAllowedMimeType('image/jpeg')).toBe(true)
      expect(isAllowedMimeType('video/mp4')).toBe(true)
      expect(isAllowedMimeType('application/pdf')).toBe(true)
    })
  })
})

describe('isAllowedFileSize', () => {
  test('IMAGE: 10MB以下は許可', () => {
    expect(isAllowedFileSize(10 * 1024 * 1024, 'IMAGE')).toBe(true)
    expect(isAllowedFileSize(10 * 1024 * 1024 + 1, 'IMAGE')).toBe(false)
  })

  test('VIDEO: 100MB以下は許可', () => {
    expect(isAllowedFileSize(100 * 1024 * 1024, 'VIDEO')).toBe(true)
    expect(isAllowedFileSize(100 * 1024 * 1024 + 1, 'VIDEO')).toBe(false)
  })

  test('DOCUMENT: 10MB以下は許可', () => {
    expect(isAllowedFileSize(10 * 1024 * 1024, 'DOCUMENT')).toBe(true)
    expect(isAllowedFileSize(10 * 1024 * 1024 + 1, 'DOCUMENT')).toBe(false)
  })

  test('OTHER: 5MB以下は許可', () => {
    expect(isAllowedFileSize(5 * 1024 * 1024, 'OTHER')).toBe(true)
    expect(isAllowedFileSize(5 * 1024 * 1024 + 1, 'OTHER')).toBe(false)
  })
})

describe('constants', () => {
  test('MAX_FILE_SIZES が正しく定義されている', () => {
    expect(MAX_FILE_SIZES.IMAGE).toBe(10 * 1024 * 1024)
    expect(MAX_FILE_SIZES.VIDEO).toBe(100 * 1024 * 1024)
    expect(MAX_FILE_SIZES.DOCUMENT).toBe(10 * 1024 * 1024)
    expect(MAX_FILE_SIZES.OTHER).toBe(5 * 1024 * 1024)
  })

  test('ALLOWED_MIME_TYPES が正しく定義されている', () => {
    expect(ALLOWED_MIME_TYPES.IMAGE).toContain('image/jpeg')
    expect(ALLOWED_MIME_TYPES.IMAGE).toContain('image/png')
    expect(ALLOWED_MIME_TYPES.VIDEO).toContain('video/mp4')
    expect(ALLOWED_MIME_TYPES.DOCUMENT).toContain('application/pdf')
    expect(ALLOWED_MIME_TYPES.OTHER).toEqual([])
  })
})
