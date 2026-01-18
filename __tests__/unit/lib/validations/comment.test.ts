/**
 * コメントバリデーションテスト
 *
 * src/lib/validations/comment.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  guestCommentSchema,
  userCommentSchema,
  createCommentSchema,
  toCommentAuthor,
} from '@/shared/lib/validations/comment'

// 有効なゲストコメントデータ
const VALID_GUEST_COMMENT = {
  content: 'これはテストコメントです。',
  guestName: '山田 太郎',
  guestEmail: 'yamada@example.com',
}

describe('guestCommentSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = guestCommentSchema.safeParse(VALID_GUEST_COMMENT)
      expect(result.success).toBe(true)
    })
  })

  describe('content', () => {
    test('空文字はエラー', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        content: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('コメント')
      }
    })

    test('2000文字超過はエラー', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        content: 'あ'.repeat(2001),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('2000文字以内')
      }
    })

    test('2000文字ちょうどは許可', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        content: 'あ'.repeat(2000),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('guestName', () => {
    test('空文字はエラー', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        guestName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('お名前')
      }
    })

    test('100文字超過はエラー', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        guestName: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('100文字ちょうどは許可', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        guestName: 'あ'.repeat(100),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('guestEmail', () => {
    test('空文字はエラー', () => {
      const result = guestCommentSchema.safeParse({
        ...VALID_GUEST_COMMENT,
        guestEmail: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('メールアドレス')
      }
    })

    test('無効なメールアドレス形式', () => {
      const invalidEmails = ['invalid', 'test@', '@example.com', 'test@.com']

      for (const guestEmail of invalidEmails) {
        const result = guestCommentSchema.safeParse({
          ...VALID_GUEST_COMMENT,
          guestEmail,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効なメールアドレス形式', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'user+tag@example.org',
      ]

      for (const guestEmail of validEmails) {
        const result = guestCommentSchema.safeParse({
          ...VALID_GUEST_COMMENT,
          guestEmail,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})

describe('userCommentSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = userCommentSchema.safeParse({ content: 'テストコメント' })
      expect(result.success).toBe(true)
    })
  })

  describe('content', () => {
    test('空文字はエラー', () => {
      const result = userCommentSchema.safeParse({ content: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('コメント')
      }
    })

    test('2000文字超過はエラー', () => {
      const result = userCommentSchema.safeParse({ content: 'あ'.repeat(2001) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('2000文字以内')
      }
    })

    test('2000文字ちょうどは許可', () => {
      const result = userCommentSchema.safeParse({ content: 'あ'.repeat(2000) })
      expect(result.success).toBe(true)
    })
  })
})

describe('createCommentSchema', () => {
  const VALID_CREATE_COMMENT = {
    postId: '123e4567-e89b-12d3-a456-426614174000',
    content: 'テストコメント',
  }

  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = createCommentSchema.safeParse(VALID_CREATE_COMMENT)
      expect(result.success).toBe(true)
    })

    test('オプショナルフィールドを含む', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        parentCommentId: '123e4567-e89b-12d3-a456-426614174001',
        guestName: 'ゲスト',
        guestEmail: 'guest@example.com',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('postId', () => {
    test('無効なUUIDはエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        postId: 'invalid-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('無効な記事ID')
      }
    })
  })

  describe('parentCommentId', () => {
    test('undefinedは許可', () => {
      const { parentCommentId, ...withoutParent } = {
        ...VALID_CREATE_COMMENT,
        parentCommentId: undefined,
      }
      const result = createCommentSchema.safeParse(withoutParent)
      expect(result.success).toBe(true)
    })

    test('無効なUUIDはエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        parentCommentId: 'invalid-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('無効なコメントID')
      }
    })
  })

  describe('content', () => {
    test('空文字はエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        content: '',
      })
      expect(result.success).toBe(false)
    })

    test('2000文字超過はエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        content: 'あ'.repeat(2001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('guestName', () => {
    test('undefinedは許可', () => {
      const result = createCommentSchema.safeParse(VALID_CREATE_COMMENT)
      expect(result.success).toBe(true)
    })

    test('100文字超過はエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        guestName: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('guestEmail', () => {
    test('undefinedは許可', () => {
      const result = createCommentSchema.safeParse(VALID_CREATE_COMMENT)
      expect(result.success).toBe(true)
    })

    test('無効なメールアドレスはエラー', () => {
      const result = createCommentSchema.safeParse({
        ...VALID_CREATE_COMMENT,
        guestEmail: 'invalid-email',
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('toCommentAuthor', () => {
  test('ユーザーコメントの変換', () => {
    const comment = {
      userId: 'user-123',
      guestName: null,
      guestEmail: null,
      user: { id: 'user-123', name: '田中太郎' },
    }
    const result = toCommentAuthor(comment)
    expect(result).toEqual({
      type: 'user',
      userId: 'user-123',
      name: '田中太郎',
    })
  })

  test('ユーザー名がnullの場合は「名無し」', () => {
    const comment = {
      userId: 'user-123',
      guestName: null,
      guestEmail: null,
      user: { id: 'user-123', name: null },
    }
    const result = toCommentAuthor(comment)
    expect(result).toEqual({
      type: 'user',
      userId: 'user-123',
      name: '名無し',
    })
  })

  test('ゲストコメントの変換', () => {
    const comment = {
      userId: null,
      guestName: 'ゲスト太郎',
      guestEmail: 'guest@example.com',
      user: null,
    }
    const result = toCommentAuthor(comment)
    expect(result).toEqual({
      type: 'guest',
      guestName: 'ゲスト太郎',
      guestEmail: 'guest@example.com',
    })
  })

  test('ゲスト情報がnullの場合はデフォルト値', () => {
    const comment = {
      userId: null,
      guestName: null,
      guestEmail: null,
      user: null,
    }
    const result = toCommentAuthor(comment)
    expect(result).toEqual({
      type: 'guest',
      guestName: 'ゲスト',
      guestEmail: '',
    })
  })
})
