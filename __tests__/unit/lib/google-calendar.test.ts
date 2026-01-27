/**
 * Google Calendar ユーティリティテスト
 *
 * ヘルパー関数のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  extractServiceAccountEmail,
  isValidCalendarId,
} from '@/shared/lib/google-calendar'

describe('google-calendar helpers', () => {
  describe('extractServiceAccountEmail', () => {
    test('有効なJSONからメールアドレスを抽出する', () => {
      const json = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        client_email: 'test@test-project.iam.gserviceaccount.com',
        client_id: '123456789',
      })

      const result = extractServiceAccountEmail(json)
      expect(result).toBe('test@test-project.iam.gserviceaccount.com')
    })

    test('client_emailがないJSONはnullを返す', () => {
      const json = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
      })

      const result = extractServiceAccountEmail(json)
      expect(result).toBeNull()
    })

    test('不正なJSONはnullを返す', () => {
      const result = extractServiceAccountEmail('invalid json')
      expect(result).toBeNull()
    })

    test('空文字列はnullを返す', () => {
      const result = extractServiceAccountEmail('')
      expect(result).toBeNull()
    })
  })

  describe('isValidCalendarId', () => {
    test('"primary"は有効なカレンダーID', () => {
      expect(isValidCalendarId('primary')).toBe(true)
    })

    test('メールアドレス形式は有効なカレンダーID', () => {
      expect(isValidCalendarId('calendar@example.com')).toBe(true)
      expect(isValidCalendarId('test.calendar@group.calendar.google.com')).toBe(true)
      expect(isValidCalendarId('abc123@calendar.google.com')).toBe(true)
    })

    test('不正な形式は無効なカレンダーID', () => {
      expect(isValidCalendarId('')).toBe(false)
      expect(isValidCalendarId('invalid')).toBe(false)
      expect(isValidCalendarId('no-at-sign')).toBe(false)
      expect(isValidCalendarId('@missing-local')).toBe(false)
      expect(isValidCalendarId('missing-domain@')).toBe(false)
    })

    test('空白を含むIDは無効', () => {
      expect(isValidCalendarId('test @example.com')).toBe(false)
      expect(isValidCalendarId(' test@example.com')).toBe(false)
    })
  })
})
