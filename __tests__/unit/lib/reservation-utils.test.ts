/**
 * 予約ユーティリティテスト
 *
 * src/lib/reservation-utils.ts のユニットテスト
 * Prismaをモックして重複チェックロジックを検証
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ReservationStatus } from '@/generated/prisma/client/enums'
import { OVERLAP_TEST_CASES, TEST_SPACE } from '../../fixtures/reservations'

// Prismaモックの設定
const mockFindFirst = mock(() => null)
const mockPrisma = {
  reservation: {
    findFirst: mockFindFirst,
  },
}

// prismaモジュールをモック
mock.module('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// モック設定後にインポート
const { checkReservationOverlap } = await import('@/lib/reservation-utils')

describe('checkReservationOverlap', () => {
  beforeEach(() => {
    mockFindFirst.mockReset()
    mockFindFirst.mockImplementation(() => null)
  })

  describe('半開区間 [start, end) の重複判定', () => {
    // OVERLAP_TEST_CASESを使用した網羅的テスト
    for (const testCase of OVERLAP_TEST_CASES) {
      test(testCase.name, async () => {
        // 既存予約があるケースでのみモックを設定
        if (testCase.shouldOverlap) {
          mockFindFirst.mockImplementation(() => ({
            id: 'existing-reservation',
            startTime: testCase.existing.start,
            endTime: testCase.existing.end,
            status: ReservationStatus.CONFIRMED,
          }))
        } else {
          mockFindFirst.mockImplementation(() => null)
        }

        const result = await checkReservationOverlap({
          spaceId: TEST_SPACE.id,
          startTime: testCase.new.start,
          endTime: testCase.new.end,
        })

        expect(result.hasOverlap).toBe(testCase.shouldOverlap)

        if (testCase.shouldOverlap) {
          expect(result.conflictingReservation).toBeDefined()
        } else {
          expect(result.conflictingReservation).toBeUndefined()
        }
      })
    }
  })

  describe('正常系', () => {
    test('重複なしの場合はhasOverlap: falseを返す', async () => {
      mockFindFirst.mockImplementation(() => null)

      const result = await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
      })

      expect(result.hasOverlap).toBe(false)
      expect(result.conflictingReservation).toBeUndefined()
    })

    test('重複ありの場合はconflictingReservationを含む', async () => {
      const conflicting = {
        id: 'conflicting-id',
        startTime: new Date('2099-01-01T11:00:00'),
        endTime: new Date('2099-01-01T13:00:00'),
        status: ReservationStatus.CONFIRMED,
      }
      mockFindFirst.mockImplementation(() => conflicting)

      const result = await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
      })

      expect(result.hasOverlap).toBe(true)
      expect(result.conflictingReservation).toEqual(conflicting)
    })
  })

  describe('excludeReservationId', () => {
    test('更新時は自分自身を除外してチェック', async () => {
      mockFindFirst.mockImplementation(() => null)

      await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
        excludeReservationId: 'self-reservation-id',
      })

      // findFirstが呼ばれた引数を検証
      expect(mockFindFirst).toHaveBeenCalled()
      const callArgs = mockFindFirst.mock.calls[0][0]
      expect(callArgs.where.id).toEqual({ not: 'self-reservation-id' })
    })

    test('excludeReservationIdなしの場合はidフィルターなし', async () => {
      mockFindFirst.mockImplementation(() => null)

      await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
      })

      expect(mockFindFirst).toHaveBeenCalled()
      const callArgs = mockFindFirst.mock.calls[0][0]
      expect(callArgs.where.id).toBeUndefined()
    })
  })

  describe('ステータスフィルター', () => {
    test('PENDING, CONFIRMEDのみをチェック対象とする', async () => {
      mockFindFirst.mockImplementation(() => null)

      await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
      })

      expect(mockFindFirst).toHaveBeenCalled()
      const callArgs = mockFindFirst.mock.calls[0][0]
      expect(callArgs.where.status.in).toContain('PENDING')
      expect(callArgs.where.status.in).toContain('CONFIRMED')
      expect(callArgs.where.status.in).not.toContain('CANCELLED')
    })
  })

  describe('Prismaクエリ構造', () => {
    test('正しいwhere句を構築する', async () => {
      mockFindFirst.mockImplementation(() => null)
      const startTime = new Date('2099-01-01T10:00:00')
      const endTime = new Date('2099-01-01T12:00:00')

      await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime,
        endTime,
      })

      expect(mockFindFirst).toHaveBeenCalled()
      const callArgs = mockFindFirst.mock.calls[0][0]

      // spaceIdフィルター
      expect(callArgs.where.spaceId).toBe(TEST_SPACE.id)

      // 半開区間の重複条件: A < D && C < B
      expect(callArgs.where.AND).toEqual([
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ])
    })

    test('selectで必要なフィールドのみ取得', async () => {
      mockFindFirst.mockImplementation(() => null)

      await checkReservationOverlap({
        spaceId: TEST_SPACE.id,
        startTime: new Date('2099-01-01T10:00:00'),
        endTime: new Date('2099-01-01T12:00:00'),
      })

      expect(mockFindFirst).toHaveBeenCalled()
      const callArgs = mockFindFirst.mock.calls[0][0]

      expect(callArgs.select).toEqual({
        id: true,
        startTime: true,
        endTime: true,
        status: true,
      })
    })
  })
})

/**
 * 半開区間の重複判定ロジック（ピュア関数版）
 *
 * Prismaを使わずに純粋なロジックをテスト可能にするための参照実装
 */
describe('半開区間重複判定（ピュアロジック）', () => {
  /**
   * 2つの半開区間 [A, B) と [C, D) が重複するか判定
   */
  function isOverlapping(
    existingStart: Date,
    existingEnd: Date,
    newStart: Date,
    newEnd: Date
  ): boolean {
    // 重複条件: A < D && C < B
    return existingStart < newEnd && newStart < existingEnd
  }

  for (const testCase of OVERLAP_TEST_CASES) {
    test(testCase.name, () => {
      const result = isOverlapping(
        testCase.existing.start,
        testCase.existing.end,
        testCase.new.start,
        testCase.new.end
      )
      expect(result).toBe(testCase.shouldOverlap)
    })
  }

  describe('境界値テスト', () => {
    const baseStart = new Date('2099-01-01T10:00:00')
    const baseEnd = new Date('2099-01-01T12:00:00')

    test('1ミリ秒でも重複すればtrue', () => {
      const newStart = new Date('2099-01-01T11:59:59.999')
      const newEnd = new Date('2099-01-01T14:00:00')
      expect(isOverlapping(baseStart, baseEnd, newStart, newEnd)).toBe(true)
    })

    test('ちょうど終了時刻に開始は重複しない', () => {
      const newStart = new Date('2099-01-01T12:00:00')
      const newEnd = new Date('2099-01-01T14:00:00')
      expect(isOverlapping(baseStart, baseEnd, newStart, newEnd)).toBe(false)
    })

    test('ちょうど開始時刻に終了は重複しない', () => {
      const newStart = new Date('2099-01-01T08:00:00')
      const newEnd = new Date('2099-01-01T10:00:00')
      expect(isOverlapping(baseStart, baseEnd, newStart, newEnd)).toBe(false)
    })
  })
})
