/**
 * Server Action HOF テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/lib/server-action-helpers.ts のユニットテスト
 *
 * withPermission, withReadPermission, withRole の高階関数をテスト
 * - 認証チェック（セッションなし / ユーザーなし）
 * - 認可チェック（管理画面アクセス / リソース権限 / リソースアクセス）
 * - 監査ログ記録
 * - ロール階層チェック
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { Role, AuditAction } from '@/shared/generated/prisma/enums'
import type { MockUser, MockSession } from '../../mocks/auth'
import { createMockUser, createMockSession } from '../../mocks/auth'
import type { ActionResult } from '@/shared/types/server-actions'

// =============================================================================
// モック定義
// =============================================================================

// auth モジュールのモック
const mockGetSession = mock<() => Promise<MockSession | null>>()
const mockGetSessionUser = mock<(session: MockSession | null) => MockUser | null>()

mock.module('@/shared/lib/auth', () => ({
  getSession: () => mockGetSession(),
  getSessionUser: (session: MockSession | null) => mockGetSessionUser(session),
}))

// permissions モジュールのモック
const mockHasPermission = mock<(role: Role, resource: string, action: string) => boolean>()
const mockUserHasResourceAccess = mock<
  (user: MockUser, resource: string, action: string, resourceId?: string) => boolean
>()
const mockCanAccessAdmin = mock<(role: Role) => boolean>()
const mockIsEditorRole = mock<(role: Role) => boolean>()

mock.module('@/admin/lib/permissions', () => ({
  hasPermission: (role: Role, resource: string, action: string) =>
    mockHasPermission(role, resource, action),
  userHasResourceAccess: (
    user: MockUser,
    resource: string,
    action: string,
    resourceId?: string
  ) => mockUserHasResourceAccess(user, resource, action, resourceId),
  canAccessAdmin: (role: Role) => mockCanAccessAdmin(role),
  isEditorRole: (role: Role) => mockIsEditorRole(role),
}))

// audit モジュールのモック
const mockLogUserAction = mock<
  (
    user: { id: string },
    action: AuditAction,
    resource: string,
    resourceId?: string
  ) => Promise<void>
>()
const mockLogPermissionDenied = mock<
  (userId: string, resource: string, action: string, resourceId?: string) => Promise<void>
>()

mock.module('@/admin/lib/audit', () => ({
  logUserAction: (
    user: { id: string },
    action: AuditAction,
    resource: string,
    resourceId?: string
  ) => mockLogUserAction(user, action, resource, resourceId),
  logPermissionDenied: (
    userId: string,
    resource: string,
    action: string,
    resourceId?: string
  ) => mockLogPermissionDenied(userId, resource, action, resourceId),
}))

// テスト対象のインポート（モック設定後）
const { withPermission, withReadPermission, withRole } = await import(
  '@/admin/lib/server-action-helpers'
)

// =============================================================================
// テストヘルパー
// =============================================================================

const ADMIN_USER = createMockUser({ id: 'admin-id', role: Role.ADMIN })
const ADMIN_SESSION = createMockSession({ id: 'admin-id', role: Role.ADMIN })

const EDITOR_USER = createMockUser({
  id: 'editor-id',
  role: Role.EDITOR,
  assignedPages: ['page-1', 'page-2'],
})
const EDITOR_SESSION = createMockSession({
  id: 'editor-id',
  role: Role.EDITOR,
  assignedPages: ['page-1', 'page-2'],
})

const VIEWER_USER = createMockUser({ id: 'viewer-id', role: Role.VIEWER })
const VIEWER_SESSION = createMockSession({ id: 'viewer-id', role: Role.VIEWER })

const REGULAR_USER = createMockUser({ id: 'user-id', role: Role.USER })
const REGULAR_SESSION = createMockSession({ id: 'user-id', role: Role.USER })

const SUPER_ADMIN_USER = createMockUser({ id: 'super-admin-id', role: Role.SUPER_ADMIN })
const SUPER_ADMIN_SESSION = createMockSession({ id: 'super-admin-id', role: Role.SUPER_ADMIN })

/**
 * 認証済みの管理者ユーザーをセットアップ
 */
function setupAuthenticatedAdmin(): void {
  mockGetSession.mockResolvedValue(ADMIN_SESSION)
  mockGetSessionUser.mockReturnValue(ADMIN_USER)
  mockCanAccessAdmin.mockReturnValue(true)
  mockHasPermission.mockReturnValue(true)
  mockIsEditorRole.mockReturnValue(false)
}

/**
 * 認証済みのエディターユーザーをセットアップ
 */
function setupAuthenticatedEditor(): void {
  mockGetSession.mockResolvedValue(EDITOR_SESSION)
  mockGetSessionUser.mockReturnValue(EDITOR_USER)
  mockCanAccessAdmin.mockReturnValue(true)
  mockHasPermission.mockReturnValue(true)
  mockIsEditorRole.mockReturnValue(true)
}

/**
 * 未認証状態をセットアップ
 */
function setupUnauthenticated(): void {
  mockGetSession.mockResolvedValue(null)
  mockGetSessionUser.mockReturnValue(null)
}

// =============================================================================
// テスト
// =============================================================================

beforeEach(() => {
  mockGetSession.mockReset()
  mockGetSessionUser.mockReset()
  mockHasPermission.mockReset()
  mockUserHasResourceAccess.mockReset()
  mockCanAccessAdmin.mockReset()
  mockIsEditorRole.mockReset()
  mockLogUserAction.mockReset()
  mockLogPermissionDenied.mockReset()

  // デフォルト: 非同期モックのデフォルト値
  mockLogUserAction.mockResolvedValue(undefined)
  mockLogPermissionDenied.mockResolvedValue(undefined)
})

// =============================================================================
// withPermission
// =============================================================================

describe('withPermission', () => {
  describe('認証チェック', () => {
    test('セッションなしの場合はログインエラーを返す', async () => {
      setupUnauthenticated()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'create')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('ユーザーがnullの場合はログインエラーを返す', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(null)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'create')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('管理者権限チェック', () => {
    test('管理画面アクセス権のないユーザーはエラー', async () => {
      mockGetSession.mockResolvedValue(REGULAR_SESSION)
      mockGetSessionUser.mockReturnValue(REGULAR_USER)
      mockCanAccessAdmin.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'create')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: '管理者権限が必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('リソース権限チェック', () => {
    test('権限のないリソース操作はエラーを返す', async () => {
      mockGetSession.mockResolvedValue(VIEWER_SESSION)
      mockGetSessionUser.mockReturnValue(VIEWER_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'create')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'spaceのcreate権限がありません',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('権限不足時にlogPermissionDeniedが呼ばれる', async () => {
      mockGetSession.mockResolvedValue(VIEWER_SESSION)
      mockGetSessionUser.mockReturnValue(VIEWER_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'delete')(handler)

      await action()

      expect(mockLogPermissionDenied).toHaveBeenCalled()
      const callArgs = mockLogPermissionDenied.mock.calls[0]
      expect(callArgs[0]).toBe('viewer-id')
      expect(callArgs[1]).toBe('space')
      expect(callArgs[2]).toBe('delete')
    })
  })

  describe('リソースアクセスチェック（checkResourceAccess）', () => {
    test('checkResourceAccess有効 & EDITORの場合、リソースアクセスをチェック', async () => {
      setupAuthenticatedEditor()
      mockUserHasResourceAccess.mockReturnValue(false)

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission<[string], void>('page', 'update', {
        checkResourceAccess: true,
      })(handler)

      const result = await action('page-3')

      expect(result).toEqual({
        success: false,
        error: 'このリソースへのアクセス権がありません',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('checkResourceAccess有効 & EDITORでアクセス権がある場合、ハンドラを実行', async () => {
      setupAuthenticatedEditor()
      mockUserHasResourceAccess.mockReturnValue(true)

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: '更新しました',
      }))
      const action = withPermission<[string], void>('page', 'update', {
        checkResourceAccess: true,
      })(handler)

      const result = await action('page-1')

      expect(result).toEqual({
        success: true,
        message: '更新しました',
      })
      expect(handler).toHaveBeenCalled()
    })

    test('checkResourceAccess有効 & ADMIN（非EDITOR）はリソースアクセスチェックをスキップ', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: '更新しました',
      }))
      const action = withPermission<[string], void>('page', 'update', {
        checkResourceAccess: true,
      })(handler)

      const result = await action('any-page-id')

      expect(result).toEqual({
        success: true,
        message: '更新しました',
      })
      expect(mockUserHasResourceAccess).not.toHaveBeenCalled()
    })

    test('checkResourceAccessが無効の場合、リソースアクセスチェックをスキップ', async () => {
      setupAuthenticatedEditor()

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: '更新しました',
      }))
      const action = withPermission<[string], void>('page', 'update')(handler)

      const result = await action('page-999')

      expect(result).toEqual({
        success: true,
        message: '更新しました',
      })
      expect(mockUserHasResourceAccess).not.toHaveBeenCalled()
    })

    test('リソースアクセス拒否時にlogPermissionDeniedが呼ばれる', async () => {
      setupAuthenticatedEditor()
      mockUserHasResourceAccess.mockReturnValue(false)

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission<[string], void>('page', 'update', {
        checkResourceAccess: true,
      })(handler)

      await action('page-3')

      expect(mockLogPermissionDenied).toHaveBeenCalledWith(
        'editor-id',
        'page',
        'update',
        'page-3'
      )
    })
  })

  describe('ハンドラ実行', () => {
    test('全認可通過時にハンドラが実行される', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (user: MockUser, data: string) => ({
        success: true as const,
        message: '作成しました',
        data: { id: '123' },
      }))
      const action = withPermission<[string], { id: string }>('space', 'create')(handler)

      const result = await action('test-data')

      expect(result).toEqual({
        success: true,
        message: '作成しました',
        data: { id: '123' },
      })
      expect(handler).toHaveBeenCalledWith(ADMIN_USER, 'test-data')
    })

    test('ハンドラにユーザーと引数が正しく渡される', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(
        async (user: MockUser, id: string, data: { title: string }) => ({
          success: true as const,
          message: '更新しました',
        })
      )
      const action = withPermission<[string, { title: string }], void>(
        'post',
        'update'
      )(handler)

      await action('post-id', { title: 'テスト' })

      expect(handler).toHaveBeenCalledWith(ADMIN_USER, 'post-id', {
        title: 'テスト',
      })
    })

    test('ハンドラの失敗結果はそのまま返される', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: false as const,
        error: 'データベースエラーが発生しました',
      }))
      const action = withPermission('space', 'create')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'データベースエラーが発生しました',
      })
    })
  })

  describe('監査ログ', () => {
    test('create/update/delete/publishアクションは成功時に監査ログを記録', async () => {
      const auditActions: Array<{
        action: 'create' | 'update' | 'delete' | 'publish'
        expected: string
      }> = [
        { action: 'create', expected: AuditAction.CREATE },
        { action: 'update', expected: AuditAction.UPDATE },
        { action: 'delete', expected: AuditAction.DELETE },
        { action: 'publish', expected: AuditAction.PUBLISH },
      ]

      for (const { action, expected } of auditActions) {
        setupAuthenticatedAdmin()
        mockLogUserAction.mockReset()
        mockLogUserAction.mockResolvedValue(undefined)

        const handler = mock(async (_user: MockUser, _id: string) => ({
          success: true as const,
          message: 'OK',
        }))
        const wrappedAction = withPermission<[string], void>('space', action)(handler)

        await wrappedAction('resource-id')

        expect(mockLogUserAction).toHaveBeenCalledWith(
          { id: 'admin-id' },
          expected,
          'space',
          'resource-id'
        )
      }
    })

    test('readアクションはデフォルトで監査ログを記録しない', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'read')(handler)

      await action()

      expect(mockLogUserAction).not.toHaveBeenCalled()
    })

    test('manageアクションはデフォルトで監査ログを記録しない', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'manage')(handler)

      await action()

      expect(mockLogUserAction).not.toHaveBeenCalled()
    })

    test('ハンドラが失敗した場合は監査ログを記録しない', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: false as const,
        error: 'エラー',
      }))
      const action = withPermission('space', 'create')(handler)

      await action()

      expect(mockLogUserAction).not.toHaveBeenCalled()
    })

    test('audit: false で監査ログを無効化できる', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'create', { audit: false })(handler)

      await action()

      expect(mockLogUserAction).not.toHaveBeenCalled()
    })

    test('audit: true で監査ログを強制的に有効化できる', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'read', { audit: true })(handler)

      await action()

      expect(mockLogUserAction).toHaveBeenCalled()
    })

    test('カスタムauditActionを指定できる', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission('space', 'update', {
        auditAction: AuditAction.PUBLISH,
      })(handler)

      await action()

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: 'admin-id' },
        AuditAction.PUBLISH,
        'space',
        undefined
      )
    })

    test('第一引数がstringの場合はresourceIdとして記録される', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser, _id: string) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission<[string], void>('space', 'delete')(handler)

      await action('space-123')

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: 'admin-id' },
        AuditAction.DELETE,
        'space',
        'space-123'
      )
    })

    test('第一引数がstring以外の場合はresourceIdがundefined', async () => {
      setupAuthenticatedAdmin()

      const handler = mock(async (_user: MockUser, _data: { title: string }) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withPermission<[{ title: string }], void>('space', 'create')(
        handler
      )

      await action({ title: 'テスト' })

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: 'admin-id' },
        AuditAction.CREATE,
        'space',
        undefined
      )
    })
  })
})

// =============================================================================
// withReadPermission
// =============================================================================

describe('withReadPermission', () => {
  describe('認証チェック', () => {
    test('セッションなしの場合はログインエラーを返す', async () => {
      setupUnauthenticated()

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('space')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('ユーザーがnullの場合はログインエラーを返す', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(null)

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('space')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('管理者権限チェック', () => {
    test('管理画面アクセス権のないユーザーはエラー', async () => {
      mockGetSession.mockResolvedValue(REGULAR_SESSION)
      mockGetSessionUser.mockReturnValue(REGULAR_USER)
      mockCanAccessAdmin.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('space')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: '管理者権限が必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('リソース読み取り権限チェック', () => {
    test('読み取り権限がない場合はエラーを返す', async () => {
      mockGetSession.mockResolvedValue(EDITOR_SESSION)
      mockGetSessionUser.mockReturnValue(EDITOR_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('space')(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'spaceの閲覧権限がありません',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('読み取り権限不足時にlogPermissionDeniedが呼ばれる', async () => {
      mockGetSession.mockResolvedValue(EDITOR_SESSION)
      mockGetSessionUser.mockReturnValue(EDITOR_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(false)

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('space')(handler)

      await action()

      expect(mockLogPermissionDenied).toHaveBeenCalled()
      const callArgs = mockLogPermissionDenied.mock.calls[0]
      expect(callArgs[0]).toBe('editor-id')
      expect(callArgs[1]).toBe('space')
      expect(callArgs[2]).toBe('read')
    })

    test('hasPermissionにreadアクションが渡される', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(true)

      const handler = mock(async (_user: MockUser) => ({
        items: [],
        total: 0,
      }))
      const action = withReadPermission('reservation')(handler)

      await action()

      expect(mockHasPermission).toHaveBeenCalledWith(Role.ADMIN, 'reservation', 'read')
    })
  })

  describe('ハンドラ実行', () => {
    test('認可通過時にハンドラが実行され結果が返される', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(true)

      const expectedData = { items: [{ id: '1', name: 'テスト' }], total: 1 }
      const handler = mock(async (_user: MockUser) => expectedData)
      const action = withReadPermission('space')(handler)

      const result = await action()

      expect(result).toEqual(expectedData)
      expect(handler).toHaveBeenCalledWith(ADMIN_USER)
    })

    test('引数がハンドラに正しく渡される', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(true)

      const handler = mock(
        async (_user: MockUser, page: number, limit: number) => ({
          items: [],
          total: 0,
          page,
          limit,
        })
      )
      const action = withReadPermission<[number, number], {
        items: unknown[]
        total: number
        page: number
        limit: number
      }>('post')(handler)

      const result = await action(2, 20)

      expect(handler).toHaveBeenCalledWith(ADMIN_USER, 2, 20)
    })
  })

  describe('監査ログ', () => {
    test('withReadPermissionは監査ログを記録しない', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)
      mockCanAccessAdmin.mockReturnValue(true)
      mockHasPermission.mockReturnValue(true)

      const handler = mock(async (_user: MockUser) => ({ items: [], total: 0 }))
      const action = withReadPermission('space')(handler)

      await action()

      expect(mockLogUserAction).not.toHaveBeenCalled()
    })
  })
})

// =============================================================================
// withRole
// =============================================================================

describe('withRole', () => {
  describe('認証チェック', () => {
    test('セッションなしの場合はログインエラーを返す', async () => {
      setupUnauthenticated()

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('ユーザーがnullの場合はログインエラーを返す', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(null)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ログインが必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('ロール階層チェック', () => {
    test('SUPER_ADMINはADMIN以上のロール要件を満たす', async () => {
      mockGetSession.mockResolvedValue(SUPER_ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(SUPER_ADMIN_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: true,
        message: 'OK',
      })
      expect(handler).toHaveBeenCalled()
    })

    test('ADMINはADMIN以上のロール要件を満たす', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: true,
        message: 'OK',
      })
      expect(handler).toHaveBeenCalled()
    })

    test('EDITORはADMIN以上のロール要件を満たさない', async () => {
      mockGetSession.mockResolvedValue(EDITOR_SESSION)
      mockGetSessionUser.mockReturnValue(EDITOR_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'ADMIN以上の権限が必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('VIEWERはEDITOR以上のロール要件を満たさない', async () => {
      mockGetSession.mockResolvedValue(VIEWER_SESSION)
      mockGetSessionUser.mockReturnValue(VIEWER_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.EDITOR)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'EDITOR以上の権限が必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('USERはVIEWER以上のロール要件を満たさない', async () => {
      mockGetSession.mockResolvedValue(REGULAR_SESSION)
      mockGetSessionUser.mockReturnValue(REGULAR_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.VIEWER)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: 'VIEWER以上の権限が必要です',
      })
      expect(handler).not.toHaveBeenCalled()
    })

    test('SUPER_ADMIN要件ではSUPER_ADMINのみ通過', async () => {
      // SUPER_ADMIN: 通過
      mockGetSession.mockResolvedValue(SUPER_ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(SUPER_ADMIN_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.SUPER_ADMIN)(handler)

      const result = await action()
      expect(result.success).toBe(true)

      // ADMIN: 拒否
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)

      const result2 = await action()
      expect(result2.success).toBe(false)
      if (!result2.success) {
        expect(result2.error).toBe('SUPER_ADMIN以上の権限が必要です')
      }
    })
  })

  describe('権限不足時の監査ログ', () => {
    test('ロール不足時にlogPermissionDeniedが呼ばれる', async () => {
      mockGetSession.mockResolvedValue(EDITOR_SESSION)
      mockGetSessionUser.mockReturnValue(EDITOR_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: true as const,
        message: 'OK',
      }))
      const action = withRole(Role.ADMIN)(handler)

      await action()

      expect(mockLogPermissionDenied).toHaveBeenCalled()
      const callArgs = mockLogPermissionDenied.mock.calls[0]
      expect(callArgs[0]).toBe('editor-id')
      expect(callArgs[1]).toBe('role')
      expect(callArgs[2]).toBe(Role.ADMIN)
    })
  })

  describe('ハンドラ実行', () => {
    test('ロール要件を満たす場合、ハンドラが実行される', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)

      const handler = mock(async (user: MockUser, id: string) => ({
        success: true as const,
        message: '削除しました',
      }))
      const action = withRole<[string], void>(Role.ADMIN)(handler)

      const result = await action('user-123')

      expect(handler).toHaveBeenCalledWith(ADMIN_USER, 'user-123')
      expect(result).toEqual({
        success: true,
        message: '削除しました',
      })
    })

    test('ハンドラの失敗結果はそのまま返される', async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION)
      mockGetSessionUser.mockReturnValue(ADMIN_USER)

      const handler = mock(async (_user: MockUser) => ({
        success: false as const,
        error: '内部エラー',
      }))
      const action = withRole(Role.ADMIN)(handler)

      const result = await action()

      expect(result).toEqual({
        success: false,
        error: '内部エラー',
      })
    })
  })
})

// =============================================================================
// HOF合成パターン
// =============================================================================

describe('HOFの合成パターン', () => {
  test('withPermissionで引数なしのアクションをラップできる', async () => {
    setupAuthenticatedAdmin()

    const handler = mock(async (_user: MockUser) => ({
      success: true as const,
      message: '取得しました',
      data: { count: 42 },
    }))
    const action = withPermission<[], { count: number }>('space', 'read', {
      audit: false,
    })(handler)

    const result = await action()

    expect(result).toEqual({
      success: true,
      message: '取得しました',
      data: { count: 42 },
    })
  })

  test('withPermissionで複数引数のアクションをラップできる', async () => {
    setupAuthenticatedAdmin()

    const handler = mock(
      async (
        _user: MockUser,
        id: string,
        data: { title: string },
        options: { notify: boolean }
      ) => ({
        success: true as const,
        message: '更新しました',
      })
    )
    const action = withPermission<
      [string, { title: string }, { notify: boolean }],
      void
    >('post', 'update')(handler)

    await action('post-1', { title: '新タイトル' }, { notify: true })

    expect(handler).toHaveBeenCalledWith(
      ADMIN_USER,
      'post-1',
      { title: '新タイトル' },
      { notify: true }
    )
  })
})
