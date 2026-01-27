/**
 * Instagram バリデーションテスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  instagramSettingsSchema,
  instagramPostUrlSchema,
  instagramTokenSchema,
  instagramPostIdSchema,
  isValidInstagramPostUrl,
  isValidInstagramToken,
  extractInstagramShortcode,
} from '@/admin/lib/validations/instagram'

describe('instagramSettingsSchema', () => {
  describe('正常系', () => {
    test('有効な設定は検証を通過', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 4,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(true)
    })

    test('全てのレイアウトタイプは許可', () => {
      const layouts = ['grid', 'carousel', 'card'] as const
      for (const layout of layouts) {
        const result = instagramSettingsSchema.safeParse({
          feedEnabled: true,
          feedLayout: layout,
          feedColumns: 3,
          feedMaxItems: 6,
          showCaption: true,
          showViewAll: false,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('feedColumns', () => {
    test('2未満はエラー', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 1,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(false)
    })

    test('6超過はエラー', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 7,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(false)
    })

    test('2〜6は許可', () => {
      for (const columns of [2, 3, 4, 5, 6]) {
        const result = instagramSettingsSchema.safeParse({
          feedEnabled: true,
          feedLayout: 'grid',
          feedColumns: columns,
          feedMaxItems: 8,
          showCaption: false,
          showViewAll: true,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('feedMaxItems', () => {
    test('1未満はエラー', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 4,
        feedMaxItems: 0,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(false)
    })

    test('24超過はエラー', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 4,
        feedMaxItems: 25,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(false)
    })

    test('1〜24は許可', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'grid',
        feedColumns: 4,
        feedMaxItems: 24,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('feedLayout', () => {
    test('無効なレイアウト値はエラー', () => {
      const result = instagramSettingsSchema.safeParse({
        feedEnabled: true,
        feedLayout: 'invalid',
        feedColumns: 4,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('instagramPostUrlSchema', () => {
  describe('正常系', () => {
    test('有効な投稿URLは検証を通過', () => {
      const validUrls = [
        'https://www.instagram.com/p/ABC123/',
        'https://instagram.com/p/ABC123/',
        'https://www.instagram.com/p/ABC123',
        'https://instagram.com/reel/ABC123/',
        'https://www.instagram.com/reel/ABC-_123/',
      ]

      for (const url of validUrls) {
        const result = instagramPostUrlSchema.safeParse(url)
        expect(result.success).toBe(true)
      }
    })
  })

  describe('異常系', () => {
    test('無効なURLはエラー', () => {
      const result = instagramPostUrlSchema.safeParse('not-a-url')
      expect(result.success).toBe(false)
    })

    test('他のドメインはエラー', () => {
      const result = instagramPostUrlSchema.safeParse(
        'https://example.com/p/ABC123/'
      )
      expect(result.success).toBe(false)
    })

    test('プロフィールURLはエラー', () => {
      const result = instagramPostUrlSchema.safeParse(
        'https://www.instagram.com/username/'
      )
      expect(result.success).toBe(false)
    })

    test('ストーリーURLはエラー', () => {
      const result = instagramPostUrlSchema.safeParse(
        'https://www.instagram.com/stories/username/'
      )
      expect(result.success).toBe(false)
    })
  })
})

describe('instagramTokenSchema', () => {
  test('空文字はエラー', () => {
    const result = instagramTokenSchema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('トークンを入力してください')
    }
  })

  test('非空文字列は許可', () => {
    const result = instagramTokenSchema.safeParse('some-token')
    expect(result.success).toBe(true)
  })
})

describe('instagramPostIdSchema', () => {
  test('有効な投稿IDは許可', () => {
    const validIds = ['ABC123', 'abc-123', 'ABC_123', 'a1b2c3']

    for (const id of validIds) {
      const result = instagramPostIdSchema.safeParse(id)
      expect(result.success).toBe(true)
    }
  })

  test('空文字はエラー', () => {
    const result = instagramPostIdSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  test('特殊文字を含むIDはエラー', () => {
    const invalidIds = ['ABC@123', 'abc#123', 'ABC 123', 'abc.123']

    for (const id of invalidIds) {
      const result = instagramPostIdSchema.safeParse(id)
      expect(result.success).toBe(false)
    }
  })
})

describe('isValidInstagramPostUrl', () => {
  test('有効なURLはtrue', () => {
    expect(isValidInstagramPostUrl('https://www.instagram.com/p/ABC123/')).toBe(
      true
    )
    expect(isValidInstagramPostUrl('https://instagram.com/reel/ABC123/')).toBe(
      true
    )
  })

  test('無効なURLはfalse', () => {
    expect(isValidInstagramPostUrl('https://example.com/p/ABC123/')).toBe(false)
    expect(isValidInstagramPostUrl('not-a-url')).toBe(false)
    expect(isValidInstagramPostUrl('https://instagram.com/username/')).toBe(
      false
    )
  })
})

describe('isValidInstagramToken', () => {
  test('50文字以上の英数字トークンはtrue', () => {
    const validToken = 'a'.repeat(50)
    expect(isValidInstagramToken(validToken)).toBe(true)
  })

  test('IGQVで始まる長いトークンはtrue', () => {
    const igToken = 'IGQV' + 'a'.repeat(100)
    expect(isValidInstagramToken(igToken)).toBe(true)
  })

  test('ハイフンやアンダースコアを含むトークンはtrue', () => {
    const token = 'abc_def-ghi' + 'a'.repeat(50)
    expect(isValidInstagramToken(token)).toBe(true)
  })

  test('50文字未満はfalse', () => {
    const shortToken = 'a'.repeat(49)
    expect(isValidInstagramToken(shortToken)).toBe(false)
  })

  test('特殊文字を含むトークンはfalse', () => {
    const invalidToken = 'abc@def' + 'a'.repeat(50)
    expect(isValidInstagramToken(invalidToken)).toBe(false)
  })
})

describe('extractInstagramShortcode', () => {
  test('投稿URLからショートコードを抽出', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/p/ABC123/')).toBe(
      'ABC123'
    )
    expect(
      extractInstagramShortcode('https://instagram.com/p/ABC-_123/')
    ).toBe('ABC-_123')
  })

  test('リールURLからショートコードを抽出', () => {
    expect(
      extractInstagramShortcode('https://www.instagram.com/reel/XYZ789/')
    ).toBe('XYZ789')
  })

  test('末尾スラッシュなしでも抽出', () => {
    expect(extractInstagramShortcode('https://www.instagram.com/p/ABC123')).toBe(
      'ABC123'
    )
  })

  test('無効なURLはnull', () => {
    expect(extractInstagramShortcode('https://example.com/p/ABC123/')).toBe(
      null
    )
    expect(extractInstagramShortcode('not-a-url')).toBe(null)
    expect(extractInstagramShortcode('https://instagram.com/username/')).toBe(
      null
    )
  })
})
