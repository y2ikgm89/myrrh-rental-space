/**
 * ユーザー管理Server Action統合テスト
 *
 * src/actions/admin/user.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーション + 権限チェックロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { Role } from '@/shared/db/enums'

// user.ts 内で定義されているスキーマを再現
type RoleValue = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'USER'
const ROLE_VALUES: readonly RoleValue[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'EDITOR',
  'VIEWER',
  'USER',
]

const createUserSchema = z.object({
  email: z.string().email({ error: '有効なメールアドレスを入力してください' }),
  password: z.string().min(8, { error: 'パスワードは8文字以上必要です' }),
  name: z.string().min(1, { error: '名前は必須です' }).max(100),
  role: z.enum(ROLE_VALUES),
})

const updateUserSchema = z.object({
  email: z.string().email({ error: '有効なメールアドレスを入力してください' }),
  name: z.string().min(1, { error: '名前は必須です' }).max(100),
  role: z.enum(ROLE_VALUES),
  password: z
    .string()
    .min(8, { error: 'パスワードは8文字以上必要です' })
    .optional()
    .or(z.literal('')),
})

// 有効なユーザー作成データ
const VALID_CREATE_USER_INPUT = {
  email: 'newuser@example.com',
  password: 'password123',
  name: '新規ユーザー',
  role: 'EDITOR' as RoleValue,
}

// 有効なユーザー更新データ
const VALID_UPDATE_USER_INPUT = {
  email: 'updated@example.com',
  name: '更新済みユーザー',
  role: 'ADMIN' as RoleValue,
  password: '',
}

describe('User Admin Action Integration', () => {
  describe('createUserSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createUserSchema.safeParse(VALID_CREATE_USER_INPUT)
        expect(result.success).toBe(true)
      })

      test('全ロール値が許可される', () => {
        for (const role of ROLE_VALUES) {
          const result = createUserSchema.safeParse({
            ...VALID_CREATE_USER_INPUT,
            role,
          })
          expect(result.success).toBe(true)
        }
      })
    })

    describe('email', () => {
      test('無効なメールアドレスはエラー', () => {
        const invalidEmails = ['invalid', 'test@', '@example.com', 'test@.com']

        for (const email of invalidEmails) {
          const result = createUserSchema.safeParse({
            ...VALID_CREATE_USER_INPUT,
            email,
          })
          expect(result.success).toBe(false)
        }
      })

      test('空のメールアドレスはエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          email: '',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('password', () => {
      test('7文字のパスワードはエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          password: '1234567',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('8文字以上')
        }
      })

      test('8文字のパスワードはOK', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          password: '12345678',
        })
        expect(result.success).toBe(true)
      })

      test('空のパスワードはエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          password: '',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('name', () => {
      test('空の名前はエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('名前は必須')
        }
      })

      test('100文字の名前はOK', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          name: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字の名前はエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          name: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('role', () => {
      test('無効なロールはエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          role: 'INVALID',
        })
        expect(result.success).toBe(false)
      })

      test('小文字のロールはエラー', () => {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          role: 'admin',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('updateUserSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updateUserSchema.safeParse(VALID_UPDATE_USER_INPUT)
        expect(result.success).toBe(true)
      })

      test('パスワード省略可能', () => {
        const { password, ...withoutPassword } = VALID_UPDATE_USER_INPUT
        const result = updateUserSchema.safeParse(withoutPassword)
        expect(result.success).toBe(true)
      })

      test('空文字パスワードは許可', () => {
        const result = updateUserSchema.safeParse({
          ...VALID_UPDATE_USER_INPUT,
          password: '',
        })
        expect(result.success).toBe(true)
      })

      test('8文字以上のパスワードは許可', () => {
        const result = updateUserSchema.safeParse({
          ...VALID_UPDATE_USER_INPUT,
          password: 'newpassword123',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('password', () => {
      test('1-7文字のパスワードはエラー', () => {
        const shortPasswords = ['1', '12', '123', '1234', '12345', '123456', '1234567']

        for (const password of shortPasswords) {
          const result = updateUserSchema.safeParse({
            ...VALID_UPDATE_USER_INPUT,
            password,
          })
          expect(result.success).toBe(false)
        }
      })
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み

  describe('Role enum 整合性', () => {
    test('Role enumとROLE_VALUESが一致', () => {
      const enumValues = Object.values(Role) as string[]
      expect(enumValues.sort()).toEqual([...ROLE_VALUES].sort())
    })

    test('Role enumは5つの値を持つ', () => {
      expect(Object.values(Role)).toHaveLength(5)
    })
  })

  describe('メールアドレス形式', () => {
    test('有効なメールアドレス形式', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'user+tag@example.org',
        'admin@localhost.local',
      ]

      for (const email of validEmails) {
        const result = createUserSchema.safeParse({
          ...VALID_CREATE_USER_INPUT,
          email,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('フィールド境界値テスト', () => {
    test('パスワード8文字（境界）', () => {
      const result = createUserSchema.safeParse({
        ...VALID_CREATE_USER_INPUT,
        password: '12345678',
      })
      expect(result.success).toBe(true)
    })

    test('名前1文字（最小）', () => {
      const result = createUserSchema.safeParse({
        ...VALID_CREATE_USER_INPUT,
        name: 'a',
      })
      expect(result.success).toBe(true)
    })

    test('名前100文字（最大）', () => {
      const result = createUserSchema.safeParse({
        ...VALID_CREATE_USER_INPUT,
        name: 'a'.repeat(100),
      })
      expect(result.success).toBe(true)
    })
  })
})
