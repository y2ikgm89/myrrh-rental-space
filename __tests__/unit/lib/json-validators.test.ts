import { describe, test, expect } from 'bun:test'
import {
  parseStringArray,
  parseStringArrayOrNull,
  parseBusinessHours,
  parseBusinessAttributes,
  type BusinessHours,
} from '@/shared/lib/json-validators'

describe('parseStringArray', () => {
  test('有効な配列を正しくパースする', () => {
    const result = parseStringArray(['a', 'b', 'c'])
    expect(result).toEqual(['a', 'b', 'c'])
  })

  test('空配列を正しくパースする', () => {
    const result = parseStringArray([])
    expect(result).toEqual([])
  })

  test('配列でない値は空配列を返す', () => {
    expect(parseStringArray('not an array')).toEqual([])
    expect(parseStringArray(123)).toEqual([])
    expect(parseStringArray({ key: 'value' })).toEqual([])
  })

  test('混合型の配列は空配列を返す', () => {
    const result = parseStringArray(['a', 123, 'b'])
    expect(result).toEqual([])
  })

  test('nullは空配列を返す', () => {
    const result = parseStringArray(null)
    expect(result).toEqual([])
  })

  test('undefinedは空配列を返す', () => {
    const result = parseStringArray(undefined)
    expect(result).toEqual([])
  })

  test('数値配列は空配列を返す', () => {
    const result = parseStringArray([1, 2, 3])
    expect(result).toEqual([])
  })
})

describe('parseStringArrayOrNull', () => {
  test('null入力はnullを返す', () => {
    const result = parseStringArrayOrNull(null)
    expect(result).toBeNull()
  })

  test('undefined入力はnullを返す', () => {
    const result = parseStringArrayOrNull(undefined)
    expect(result).toBeNull()
  })

  test('有効な配列を正しくパースする', () => {
    const result = parseStringArrayOrNull(['a', 'b', 'c'])
    expect(result).toEqual(['a', 'b', 'c'])
  })

  test('空配列を正しくパースする', () => {
    const result = parseStringArrayOrNull([])
    expect(result).toEqual([])
  })

  test('無効な配列はnullを返す', () => {
    expect(parseStringArrayOrNull(['a', 123])).toBeNull()
    expect(parseStringArrayOrNull('not an array')).toBeNull()
    expect(parseStringArrayOrNull(123)).toBeNull()
  })
})

describe('parseBusinessHours', () => {
  const validNewFormat: BusinessHours = {
    monday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
    tuesday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
    wednesday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
    thursday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
    friday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
  }

  test('新形式の営業時間を正しくパースする', () => {
    const result = parseBusinessHours(validNewFormat)
    expect(result).toEqual(validNewFormat)
  })

  test('旧形式（slots配列なし）はnullを返す', () => {
    const legacyFormat = {
      monday: { isOpen: true, openTime: '10:00', closeTime: '20:00' },
      tuesday: { isOpen: true, openTime: '10:00', closeTime: '20:00' },
      wednesday: { isOpen: true, openTime: '10:00', closeTime: '20:00' },
      thursday: { isOpen: true, openTime: '10:00', closeTime: '20:00' },
      friday: { isOpen: true, openTime: '10:00', closeTime: '20:00' },
      saturday: { isOpen: false, openTime: null, closeTime: null },
      sunday: { isOpen: false, openTime: null, closeTime: null },
    }

    const result = parseBusinessHours(legacyFormat)
    expect(result).toBeNull()
  })

  test('無効なデータはnullを返す', () => {
    expect(parseBusinessHours({ invalid: 'data' })).toBeNull()
    expect(parseBusinessHours('not an object')).toBeNull()
    expect(parseBusinessHours(123)).toBeNull()
    expect(parseBusinessHours([])).toBeNull()
  })

  test('nullはnullを返す', () => {
    const result = parseBusinessHours(null)
    expect(result).toBeNull()
  })

  test('undefinedはnullを返す', () => {
    const result = parseBusinessHours(undefined)
    expect(result).toBeNull()
  })

  test('複数スロットの新形式を正しくパースする', () => {
    const multiSlotFormat: BusinessHours = {
      monday: {
        isOpen: true,
        slots: [
          { openTime: '09:00', closeTime: '12:00' },
          { openTime: '14:00', closeTime: '18:00' },
        ],
      },
      tuesday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
      wednesday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
      thursday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
      friday: { isOpen: true, slots: [{ openTime: '09:00', closeTime: '18:00' }] },
      saturday: { isOpen: false, slots: [] },
      sunday: { isOpen: false, slots: [] },
    }

    const result = parseBusinessHours(multiSlotFormat)
    expect(result).toEqual(multiSlotFormat)
    expect(result?.monday.slots.length).toBe(2)
  })
})

describe('parseBusinessAttributes', () => {
  test('有効なオブジェクトを正しくパースする', () => {
    const input = {
      wifi: true,
      parking: false,
      accessible: true,
    }
    const result = parseBusinessAttributes(input)
    expect(result).toEqual(input)
  })

  test('混合型（boolean + 非boolean）はnullを返す', () => {
    const input = {
      wifi: true,
      parking: false,
      name: 'test',
      count: 123,
      accessible: true,
    }
    expect(parseBusinessAttributes(input)).toBeNull()
  })

  test('nullはnullを返す', () => {
    expect(parseBusinessAttributes(null)).toBeNull()
  })

  test('undefinedはnullを返す', () => {
    expect(parseBusinessAttributes(undefined)).toBeNull()
  })

  test('配列はnullを返す', () => {
    expect(parseBusinessAttributes([true, false])).toBeNull()
    expect(parseBusinessAttributes(['wifi', 'parking'])).toBeNull()
  })

  test('空オブジェクトはnullを返す', () => {
    expect(parseBusinessAttributes({})).toBeNull()
  })

  test('booleanプロパティがないオブジェクトはnullを返す', () => {
    const input = {
      name: 'test',
      count: 123,
      items: ['a', 'b'],
    }
    expect(parseBusinessAttributes(input)).toBeNull()
  })

  test('文字列はnullを返す', () => {
    expect(parseBusinessAttributes('not an object')).toBeNull()
  })

  test('数値はnullを返す', () => {
    expect(parseBusinessAttributes(123)).toBeNull()
  })

  test('ネストされたオブジェクトを含む場合はnullを返す', () => {
    const input = {
      wifi: true,
      nested: { parking: true },
    }
    expect(parseBusinessAttributes(input)).toBeNull()
  })
})
