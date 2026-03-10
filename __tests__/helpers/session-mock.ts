/**
 * セッションモックヘルパー
 *
 * - 認証状態の簡易設定
 * - ロールベースのセッション生成
 */

import {
  setMockSession,
  createMockSession,
  clearMockSession,
  type MockUser,
} from "../mocks/auth";
import {
  SUPER_ADMIN_USER,
  ADMIN_USER,
  EDITOR_USER,
  VIEWER_USER,
  REGULAR_USER,
} from "../fixtures/users";

/**
 * SUPER_ADMINセッションをモック
 */
export function mockSuperAdminSession(): void {
  setMockSession(createMockSession(SUPER_ADMIN_USER));
}

/**
 * ADMINセッションをモック
 */
export function mockAdminSession(): void {
  setMockSession(createMockSession(ADMIN_USER));
}

/**
 * EDITORセッションをモック
 * @param assignedPages 割り当てられたページIDの配列
 */
export function mockEditorSession(assignedPages?: string[]): void {
  setMockSession(
    createMockSession({
      ...EDITOR_USER,
      assignedPages: assignedPages ?? [],
    }),
  );
}

/**
 * VIEWERセッションをモック
 */
export function mockViewerSession(): void {
  setMockSession(createMockSession(VIEWER_USER));
}

/**
 * 一般ユーザーセッションをモック
 */
export function mockUserSession(): void {
  setMockSession(createMockSession(REGULAR_USER));
}

/**
 * 未認証状態をモック
 */
export function mockNoSession(): void {
  clearMockSession();
}

/**
 * カスタムユーザーでセッションをモック
 */
export function mockCustomSession(user: Partial<MockUser>): void {
  setMockSession(createMockSession(user));
}
