/**
 * スペースバリデーションテスト
 *
 * src/lib/validations/space.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import { spaceFormSchema, defaultSpaceFormValues } from '@/admin/lib/validations/space'

// 有効なスペースデータ
const VALID_SPACE_INPUT = {
  name: 'テストスペース',
  description: 'これはテスト用のスペースの説明文です。10文字以上必要です。',
  address: '東京都渋谷区1-2-3',
  access: '渋谷駅から徒歩5分',
  capacity: 10,
  area: 50.5,
  hourlyPrice: 1000,
  dailyPrice: 8000,
  mainImageUrl: 'https://example.com/images/main.jpg',
  imageUrls: ['https://example.com/images/1.jpg', 'https://example.com/images/2.jpg'],
  facilities: ['WiFi', 'プロジェクター', '電源'],
  isPublished: false,
  termsId: null,
}

describe('spaceFormSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = spaceFormSchema.safeParse(VALID_SPACE_INPUT)
      expect(result.success).toBe(true)
    })

    test('オプショナルフィールドを省略可能', () => {
      const minimalInput = {
        name: 'テストスペース',
        description: 'これはテスト用のスペースの説明文です。',
        address: '東京都渋谷区1-2-3',
        capacity: 1,
        hourlyPrice: 0,
        mainImageUrl: 'https://example.com/images/main.jpg',
      }
      const result = spaceFormSchema.safeParse(minimalInput)
      expect(result.success).toBe(true)
    })

    test('デフォルト値が適用される', () => {
      const input = {
        name: 'テストスペース',
        description: 'これはテスト用のスペースの説明文です。',
        address: '東京都渋谷区1-2-3',
        capacity: 1,
        hourlyPrice: 0,
        mainImageUrl: 'https://example.com/images/main.jpg',
      }
      const result = spaceFormSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrls).toEqual([])
        expect(result.data.facilities).toEqual([])
        expect(result.data.isPublished).toBe(false)
      }
    })
  })

  describe('name', () => {
    test('空文字はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('名前')
      }
    })

    test('100文字超過はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('100文字ちょうどは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        name: 'あ'.repeat(100),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('description', () => {
    test('空文字はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        description: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('説明')
      }
    })

    test('10文字未満はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        description: '123456789', // 9文字
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('10文字以上')
      }
    })

    test('10文字ちょうどは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        description: '1234567890', // 10文字
      })
      expect(result.success).toBe(true)
    })
  })

  describe('address', () => {
    test('空文字はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        address: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('住所')
      }
    })
  })

  describe('access', () => {
    test('オプショナル（undefined）は許可', () => {
      const { access, ...withoutAccess } = VALID_SPACE_INPUT
      const result = spaceFormSchema.safeParse(withoutAccess)
      expect(result.success).toBe(true)
    })

    test('空文字は許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        access: '',
      })
      expect(result.success).toBe(true)
    })

    test('500文字超過はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        access: 'あ'.repeat(501),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500文字以内')
      }
    })
  })

  describe('capacity', () => {
    test('0はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 0,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1以上')
      }
    })

    test('1001はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 1001,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1000以下')
      }
    })

    test('小数はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        capacity: 10.5,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('整数')
      }
    })

    test('1と1000は許可', () => {
      for (const capacity of [1, 1000]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          capacity,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('area', () => {
    test('nullは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: null,
      })
      expect(result.success).toBe(true)
    })

    test('0以下はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 0,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('正の数')
      }
    })

    test('10001はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 10001,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('10000以下')
      }
    })

    test('小数は許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        area: 50.5,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('hourlyPrice', () => {
    test('負の値はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: -1,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('0以上')
      }
    })

    test('1000001はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        hourlyPrice: 1000001,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1000000以下')
      }
    })

    test('0と1000000は許可', () => {
      for (const hourlyPrice of [0, 1000000]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          hourlyPrice,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('dailyPrice', () => {
    test('nullは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: null,
      })
      expect(result.success).toBe(true)
    })

    test('負の値はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: -1,
      })
      expect(result.success).toBe(false)
    })

    test('10000001はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        dailyPrice: 10000001,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('10000000以下')
      }
    })
  })

  describe('mainImageUrl', () => {
    test('空文字はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        mainImageUrl: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('メイン画像URL')
      }
    })

    test('無効なURLはエラー', () => {
      // Zodの.url()はftp://も有効なURLとして扱う
      const invalidUrls = ['invalid', 'not-a-url', 'example.com']

      for (const mainImageUrl of invalidUrls) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効なURLは許可', () => {
      const validUrls = [
        'https://example.com/image.jpg',
        'http://example.com/image.png',
      ]

      for (const mainImageUrl of validUrls) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          mainImageUrl,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('imageUrls', () => {
    test('空配列は許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        imageUrls: [],
      })
      expect(result.success).toBe(true)
    })

    test('11枚以上はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        imageUrls: Array(11).fill('https://example.com/image.jpg'),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('最大10枚')
      }
    })

    test('無効なURLが含まれるとエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        imageUrls: ['https://example.com/image.jpg', 'invalid-url'],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('facilities', () => {
    test('空配列は許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: [],
      })
      expect(result.success).toBe(true)
    })

    test('空文字を含む配列はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: ['WiFi', ''],
      })
      expect(result.success).toBe(false)
    })

    test('51文字以上の要素はエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        facilities: ['あ'.repeat(51)],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('isPublished', () => {
    test('true/falseは許可', () => {
      for (const isPublished of [true, false]) {
        const result = spaceFormSchema.safeParse({
          ...VALID_SPACE_INPUT,
          isPublished,
        })
        expect(result.success).toBe(true)
      }
    })

    test('デフォルトはfalse', () => {
      const { isPublished, ...withoutIsPublished } = VALID_SPACE_INPUT
      const result = spaceFormSchema.safeParse(withoutIsPublished)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isPublished).toBe(false)
      }
    })
  })

  describe('termsId', () => {
    test('nullは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        termsId: null,
      })
      expect(result.success).toBe(true)
    })

    test('undefinedは許可', () => {
      const { termsId, ...withoutTermsId } = VALID_SPACE_INPUT
      const result = spaceFormSchema.safeParse(withoutTermsId)
      expect(result.success).toBe(true)
    })

    test('有効なUUIDは許可', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        termsId: '123e4567-e89b-12d3-a456-426614174000',
      })
      expect(result.success).toBe(true)
    })

    test('無効なUUIDはエラー', () => {
      const result = spaceFormSchema.safeParse({
        ...VALID_SPACE_INPUT,
        termsId: 'invalid-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('利用規約IDが無効')
      }
    })
  })
})

describe('defaultSpaceFormValues', () => {
  test('デフォルト値が正しく定義されている', () => {
    expect(defaultSpaceFormValues).toEqual({
      name: '',
      description: '',
      address: '',
      access: '',
      capacity: 10,
      area: null,
      hourlyPrice: 0,
      dailyPrice: null,
      mainImageUrl: '',
      imageUrls: [],
      facilities: [],
      isPublished: false,
      termsId: null,
      locationId: null,
      categoryId: null,
    })
  })
})
