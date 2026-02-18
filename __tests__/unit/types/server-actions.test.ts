/**
 * Server Actions HOFテスト
 *
 * server-action-helpers.ts の高階関数テスト
 * 認証・認可・監査ログの統合動作を検証
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { Role } from '@/shared/generated/prisma/enums'
import type { ActionResult } from '@/shared/types/server-actions'
import {
  SUPER_ADMIN_USER,
  ADMIN_USER,
  EDITOR_USER,
  VIEWER_USER,
  REGULAR_USER,
} from '../../fixtures/users'

// モック関数の定義
// getSession は null | { user: MockUser } のどちらも返せるよう unknown に拡大
const mockGetSession = mock<() => unknown>(() => null)
const mockGetSessionUser = mock((session: unknown) => {
  if (!session || typeof session !== 'object' || !('user' in session)) return null
  return (session as { user: unknown }).user
})
const mockHasPermission = mock(() => true)
const mockUserHasResourceAccess = mock(() => true)
const mockCanAccessAdmin = mock(() => true)
const mockIsEditorRole = mock((role: unknown) => role === Role.EDITOR)
const mockLogUserAction = mock(() => Promise.resolve())
const mockLogPermissionDenied = mock(() => Promise.resolve())

// モジュールモック
mock.module('@/shared/lib/auth', () => ({
  getSession: mockGetSession,
  getSessionUser: mockGetSessionUser,
}))

mock.module('@/admin/lib/permissions', () => ({
  hasPermission: mockHasPermission,
  userHasResourceAccess: mockUserHasResourceAccess,
  canAccessAdmin: mockCanAccessAdmin,
  isEditorRole: mockIsEditorRole,
}))

mock.module('@/admin/lib/audit', () => ({
  logUserAction: mockLogUserAction,
  logPermissionDenied: mockLogPermissionDenied,
}))

// モック後にインポート
const {
  withPermission,
  withReadPermission,
  withRole,
} = await import('@/admin/lib/server-action-helpers')

const {
  createSuccess,
  createFailure,
  isActionSuccess,
  isActionFailure,
} = await import('@/shared/types/server-actions')

describe('createSuccess / createFailure', () => {
  test('createSuccess: データなし', () => {
    const result = createSuccess('成功しました')
    expect(result).toEqual({
      success: true,
      message: '成功しました',
    })
  })

  test('createSuccess: データあり', () => {
    const result = createSuccess('作成しました', { id: '123' })
    expect(result).toEqual({
      success: true,
      message: '作成しました',
      data: { id: '123' },
    })
  })

  test('createFailure: 基本', () => {
    const result = createFailure('エラーが発生しました')
    expect(result).toEqual({
      success: false,
      error: 'エラーが発生しました',
    })
  })

  test('createFailure: フィールドエラーあり', () => {
    const result = createFailure('検証エラー', {
      email: ['無効なメールアドレス'],
      name: ['必須項目です'],
    })
    expect(result).toEqual({
      success: false,
      error: '検証エラー',
      fieldErrors: {
        email: ['無効なメールアドレス'],
        name: ['必須項目です'],
      },
    })
  })
})

describe('isActionSuccess / isActionFailure', () => {
  test('isActionSuccess: 成功判定', () => {
    const success = createSuccess('OK')
    const failure = createFailure('NG')

    // TS: ActionSuccess<void> 条件型の推論を補助するため <void> を明示
    expect(isActionSuccess<void>(success)).toBe(true)
    expect(isActionSuccess<void>(failure)).toBe(false)
  })

  test('isActionFailure: 失敗判定', () => {
    const success = createSuccess('OK')
    const failure = createFailure('NG')

    expect(isActionFailure<void>(failure)).toBe(true)
    expect(isActionFailure<void>(success)).toBe(false)
  })
})

describe('withPermission', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockCanAccessAdmin.mockReset()
    mockHasPermission.mockReset()
    mockUserHasResourceAccess.mockReset()
    mockIsEditorRole.mockReset()
    mockLogUserAction.mockReset()
    mockLogPermissionDenied.mockReset()

    // デフォルトのモック設定
    mockCanAccessAdmin.mockImplementation(() => true)
    mockHasPermission.mockImplementation(() => true)
    mockUserHasResourceAccess.mockImplementation(() => true)
    mockIsEditorRole.mockImplementation((role: unknown) => role === Role.EDITOR)
  })

  test('未認証の場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => null)

    const action = withPermission('space', 'create')(async (user) => {
      return createSuccess('OK')
    })

    const result = await action()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('ログイン')
    }
  })

  test('管理画面アクセス権がない場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => ({
      user: REGULAR_USER,
    }))
    mockCanAccessAdmin.mockImplementation(() => false)

    const action = withPermission('space', 'create')(async (user) => {
      return createSuccess('OK')
    })

    const result = await action()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('管理者権限')
    }
  })

  test('リソース権限がない場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => ({
      user: VIEWER_USER,
    }))
    mockCanAccessAdmin.mockImplementation(() => true)
    mockHasPermission.mockImplementation(() => false)

    const action = withPermission('space', 'delete')(async (user) => {
      return createSuccess('OK')
    })

    const result = await action()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('権限がありません')
    }
  })

  test('権限不足時に監査ログを記録', async () => {
    mockGetSession.mockImplementation(() => ({
      user: VIEWER_USER,
    }))
    mockCanAccessAdmin.mockImplementation(() => true)
    mockHasPermission.mockImplementation(() => false)

    const action = withPermission('space', 'delete')(async (user) => {
      return createSuccess('OK')
    })

    await action()
    expect(mockLogPermissionDenied).toHaveBeenCalled()
  })

  test('正常実行時に監査ログを記録（書き込み操作）', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const action = withPermission('space', 'create')(async (user) => {
      return createSuccess('作成しました')
    })

    const result = await action()
    expect(result.success).toBe(true)
    expect(mockLogUserAction).toHaveBeenCalled()
  })

  test('読み取り操作では監査ログを記録しない', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const action = withPermission('space', 'read')(async (user) => {
      return createSuccess('取得しました')
    })

    await action()
    expect(mockLogUserAction).not.toHaveBeenCalled()
  })

  test('認証済み管理者の場合は関数を実行しデータを返す', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    // TArgs = [string], TData = { user: string; data: string } — 明示的に指定して handler param の型制約を解決
    const action = withPermission<[string], { user: string; data: string }>('space', 'read')(async (user, data: string) => {
      return createSuccess('OK', { user: user.id, data })
    })

    const result = await action('test-data')
    expect(result.success).toBe(true)
    if (result.success && 'data' in result) {
      expect(result.data).toEqual({ user: ADMIN_USER.id, data: 'test-data' })
    }
  })

  describe('checkResourceAccess', () => {
    test('EDITORはリソースアクセス権をチェック', async () => {
      mockGetSession.mockImplementation(() => ({
        user: EDITOR_USER,
      }))
      mockUserHasResourceAccess.mockImplementation(() => true)

      const action = withPermission<[string]>('page', 'update', { checkResourceAccess: true })(
        async (user, id: string) => {
          return createSuccess('更新しました')
        }
      )

      const result = await action('page-1')
      expect(result.success).toBe(true)
      expect(mockUserHasResourceAccess).toHaveBeenCalled()
    })

    test('EDITORが割り当てられていないリソースにはアクセス不可', async () => {
      mockGetSession.mockImplementation(() => ({
        user: EDITOR_USER,
      }))
      mockUserHasResourceAccess.mockImplementation(() => false)

      const action = withPermission<[string]>('page', 'update', { checkResourceAccess: true })(
        async (user, id: string) => {
          return createSuccess('更新しました')
        }
      )

      const result = await action('page-99')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('アクセス権')
      }
    })
  })

  describe('引数の受け渡し', () => {
    test('複数引数を正しく渡す', async () => {
      mockGetSession.mockImplementation(() => ({
        user: ADMIN_USER,
      }))

      const action = withPermission<[string, string, boolean], { id: string; name: string; active: boolean }>('space', 'update')(
        async (user, id: string, name: string, active: boolean) => {
          return createSuccess('更新しました', { id, name, active })
        }
      )

      const result = await action('space-1', 'New Name', true)
      expect(result.success).toBe(true)
      if (result.success && 'data' in result) {
        expect(result.data).toEqual({
          id: 'space-1',
          name: 'New Name',
          active: true,
        })
      }
    })
  })
})

describe('withReadPermission', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockCanAccessAdmin.mockReset()
    mockHasPermission.mockReset()
    mockLogPermissionDenied.mockReset()
    mockLogUserAction.mockReset()

    mockCanAccessAdmin.mockImplementation(() => true)
    mockHasPermission.mockImplementation(() => true)
  })

  test('未認証の場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => null)

    const action = withReadPermission('space')(async (user) => {
      return { spaces: [], total: 0 }
    })

    const result = await action()
    // withReadPermission の TReturn 推論不可により result は unknown | ActionFailure
    // toMatchObject で型制約なしにアサーション
    expect(result).toMatchObject({ success: false })
  })

  test('読み取り権限がない場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => ({
      user: VIEWER_USER,
    }))
    mockHasPermission.mockImplementation(() => false)

    const action = withReadPermission('user')(async (user) => {
      return { users: [] }
    })

    const result = await action()
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('閲覧権限') })
  })

  test('正常実行時はデータを返す', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const action = withReadPermission('space')(async (user) => {
      return { spaces: [{ id: '1', name: 'Space 1' }], total: 1 }
    })

    const result = await action()
    expect(result).toMatchObject({ spaces: [{ id: '1', name: 'Space 1' }] })
  })

  test('監査ログは記録しない', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const action = withReadPermission('space')(async (user) => {
      return { spaces: [] }
    })

    await action()
    expect(mockLogUserAction).not.toHaveBeenCalled()
  })
})

describe('withRole', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockLogPermissionDenied.mockReset()
  })

  test('未認証の場合はエラーを返す', async () => {
    mockGetSession.mockImplementation(() => null)

    const action = withRole(Role.SUPER_ADMIN)(async (user) => {
      return createSuccess('OK')
    })

    const result = await action()
    expect(result.success).toBe(false)
  })

  describe('ロール階層チェック', () => {
    test('SUPER_ADMINはSUPER_ADMIN専用アクションを実行可能', async () => {
      mockGetSession.mockImplementation(() => ({
        user: SUPER_ADMIN_USER,
      }))

      const action = withRole(Role.SUPER_ADMIN)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(true)
    })

    test('ADMINはSUPER_ADMIN専用アクションを実行不可', async () => {
      mockGetSession.mockImplementation(() => ({
        user: ADMIN_USER,
      }))

      const action = withRole(Role.SUPER_ADMIN)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('SUPER_ADMIN以上')
      }
    })

    test('EDITORはADMIN以上のアクションを実行不可', async () => {
      mockGetSession.mockImplementation(() => ({
        user: EDITOR_USER,
      }))

      const action = withRole(Role.ADMIN)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(false)
    })

    test('VIEWERはEDITOR以上のアクションを実行不可', async () => {
      mockGetSession.mockImplementation(() => ({
        user: VIEWER_USER,
      }))

      const action = withRole(Role.EDITOR)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(false)
    })

    test('SUPER_ADMINはADMIN専用アクションも実行可能', async () => {
      mockGetSession.mockImplementation(() => ({
        user: SUPER_ADMIN_USER,
      }))

      const action = withRole(Role.ADMIN)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(true)
    })

    test('ADMINはEDITOR以上のアクションを実行可能', async () => {
      mockGetSession.mockImplementation(() => ({
        user: ADMIN_USER,
      }))

      const action = withRole(Role.EDITOR)(async (user) => {
        return createSuccess('OK')
      })

      const result = await action()
      expect(result.success).toBe(true)
    })
  })

  test('権限不足時に監査ログを記録', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const action = withRole(Role.SUPER_ADMIN)(async (user) => {
      return createSuccess('OK')
    })

    await action()
    expect(mockLogPermissionDenied).toHaveBeenCalled()
  })
})

describe('HOFの組み合わせテスト', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockCanAccessAdmin.mockReset()
    mockHasPermission.mockReset()
    mockIsEditorRole.mockReset()
    mockLogUserAction.mockReset()

    mockCanAccessAdmin.mockImplementation(() => true)
    mockHasPermission.mockImplementation(() => true)
    mockIsEditorRole.mockImplementation((role: unknown) => role === Role.EDITOR)
  })

  test('典型的なCRUD操作シナリオ: Create', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const createSpace = withPermission<[string], { id: string; name: string }>('space', 'create')(
      async (user, name: string) => {
        return createSuccess('作成しました', { id: 'new-id', name })
      }
    )

    const result = await createSpace('New Space')
    expect(result.success).toBe(true)
    if (result.success && 'data' in result) {
      expect(result.data.name).toBe('New Space')
    }
  })

  test('典型的なCRUD操作シナリオ: Read', async () => {
    mockGetSession.mockImplementation(() => ({
      user: VIEWER_USER,
    }))

    const getSpaces = withReadPermission('space')(async (user) => {
      return {
        spaces: [{ id: '1', name: 'Space 1' }],
        total: 1,
      }
    })

    const result = await getSpaces()
    expect(result).toMatchObject({ spaces: [{ id: '1', name: 'Space 1' }] })
  })

  test('典型的なCRUD操作シナリオ: Update', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const updateSpace = withPermission<[string, { name: string }], { id: string; name: string }>('space', 'update')(
      async (user, id: string, data: { name: string }) => {
        return createSuccess('更新しました', { id, ...data })
      }
    )

    const result = await updateSpace('space-1', { name: 'Updated' })
    expect(result.success).toBe(true)
  })

  test('典型的なCRUD操作シナリオ: Delete', async () => {
    mockGetSession.mockImplementation(() => ({
      user: ADMIN_USER,
    }))

    const deleteSpace = withPermission<[string]>('space', 'delete')(
      async (user, id: string) => {
        return createSuccess('削除しました')
      }
    )

    const result = await deleteSpace('space-1')
    expect(result.success).toBe(true)
  })
})
