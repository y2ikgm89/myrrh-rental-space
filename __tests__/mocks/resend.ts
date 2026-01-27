/**
 * Resend メールサービス モック
 *
 * メール送信をテストするためのモック実装
 */

import { mock } from 'bun:test'

// =============================================================================
// Types
// =============================================================================

export interface MockEmailResult {
  id: string
}

export interface MockEmail {
  from: string
  to: string | string[]
  subject: string
  html?: string
  react?: React.ReactElement
}

// =============================================================================
// Mock Implementation
// =============================================================================

/**
 * 送信されたメールを記録する配列
 */
export const sentEmails: MockEmail[] = []

/**
 * Resend.emails.send のモック関数
 */
export const mockSendEmail = mock<(email: MockEmail) => Promise<MockEmailResult>>(
  (email: MockEmail) => {
    sentEmails.push(email)
    return Promise.resolve({ id: `mock-email-${Date.now()}` })
  }
)

/**
 * Resend クライアントのモック
 */
export const mockResendClient = {
  emails: {
    send: mockSendEmail,
  },
}

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * モックをリセット
 */
export function resetResendMock(): void {
  sentEmails.length = 0
  mockSendEmail.mockClear()
}

/**
 * 送信されたメールを取得
 */
export function getSentEmails(): MockEmail[] {
  return [...sentEmails]
}

/**
 * 特定の宛先に送信されたメールを検索
 */
export function findEmailTo(email: string): MockEmail | undefined {
  return sentEmails.find((e) =>
    Array.isArray(e.to) ? e.to.includes(email) : e.to === email
  )
}

/**
 * 特定の件名のメールを検索
 */
export function findEmailBySubject(subject: string): MockEmail | undefined {
  return sentEmails.find((e) => e.subject.includes(subject))
}
