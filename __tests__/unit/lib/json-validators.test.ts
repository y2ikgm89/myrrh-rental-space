import { describe, test, expect } from 'bun:test'
import {
  parseStringArray,
  parseStringArrayOrNull,
  parseBusinessHours,
  parseDiscountType,
  parseDurationDiscountOverride,
  parseTaxRateType,
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

  test('旧形式（営業日・時刻あり）を新形式に自動変換する', () => {
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
    expect(result).not.toBeNull()
    expect(result?.monday.isOpen).toBe(true)
    expect(result?.monday.slots).toEqual([{ openTime: '10:00', closeTime: '20:00' }])
    expect(result?.saturday.isOpen).toBe(false)
    expect(result?.saturday.slots).toEqual([])
  })

  test('旧形式（休業日）を新形式に自動変換する', () => {
    const legacyFormat = {
      monday: { isOpen: false, openTime: null, closeTime: null },
      tuesday: { isOpen: false, openTime: null, closeTime: null },
      wednesday: { isOpen: false, openTime: null, closeTime: null },
      thursday: { isOpen: false, openTime: null, closeTime: null },
      friday: { isOpen: false, openTime: null, closeTime: null },
      saturday: { isOpen: false, openTime: null, closeTime: null },
      sunday: { isOpen: false, openTime: null, closeTime: null },
    }

    const result = parseBusinessHours(legacyFormat)
    expect(result).not.toBeNull()
    expect(result?.monday.isOpen).toBe(false)
    expect(result?.monday.slots).toEqual([])
  })

  test('旧形式（営業日だが時刻なし）をデフォルト時刻で変換する', () => {
    const legacyFormat = {
      monday: { isOpen: true, openTime: null, closeTime: null },
      tuesday: { isOpen: true, openTime: null, closeTime: null },
      wednesday: { isOpen: true, openTime: null, closeTime: null },
      thursday: { isOpen: true, openTime: null, closeTime: null },
      friday: { isOpen: true, openTime: null, closeTime: null },
      saturday: { isOpen: false, openTime: null, closeTime: null },
      sunday: { isOpen: false, openTime: null, closeTime: null },
    }

    const result = parseBusinessHours(legacyFormat)
    expect(result).not.toBeNull()
    expect(result?.monday.isOpen).toBe(true)
    expect(result?.monday.slots).toEqual([{ openTime: '09:00', closeTime: '21:00' }])
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

describe('parseDiscountType', () => {
  test('有効な値 "none" を正しく返す', () => {
    expect(parseDiscountType('none')).toBe('none')
  })

  test('有効な値 "percentage" を正しく返す', () => {
    expect(parseDiscountType('percentage')).toBe('percentage')
  })

  test('有効な値 "fixed" を正しく返す', () => {
    expect(parseDiscountType('fixed')).toBe('fixed')
  })

  test('無効な文字列はデフォルト値 "none" を返す', () => {
    expect(parseDiscountType('invalid')).toBe('none')
    expect(parseDiscountType('PERCENTAGE')).toBe('none')
    expect(parseDiscountType('')).toBe('none')
  })

  test('文字列以外はデフォルト値 "none" を返す', () => {
    expect(parseDiscountType(123)).toBe('none')
    expect(parseDiscountType(null)).toBe('none')
    expect(parseDiscountType(undefined)).toBe('none')
    expect(parseDiscountType({ type: 'percentage' })).toBe('none')
    expect(parseDiscountType(['percentage'])).toBe('none')
  })
})

describe('parseDurationDiscountOverride', () => {
  test('有効な値 "inherit" を正しく返す', () => {
    expect(parseDurationDiscountOverride('inherit')).toBe('inherit')
  })

  test('有効な値 "enabled" を正しく返す', () => {
    expect(parseDurationDiscountOverride('enabled')).toBe('enabled')
  })

  test('有効な値 "disabled" を正しく返す', () => {
    expect(parseDurationDiscountOverride('disabled')).toBe('disabled')
  })

  test('無効な文字列はデフォルト値 "inherit" を返す', () => {
    expect(parseDurationDiscountOverride('invalid')).toBe('inherit')
    expect(parseDurationDiscountOverride('ENABLED')).toBe('inherit')
    expect(parseDurationDiscountOverride('')).toBe('inherit')
  })

  test('文字列以外はデフォルト値 "inherit" を返す', () => {
    expect(parseDurationDiscountOverride(123)).toBe('inherit')
    expect(parseDurationDiscountOverride(null)).toBe('inherit')
    expect(parseDurationDiscountOverride(undefined)).toBe('inherit')
    expect(parseDurationDiscountOverride({ value: 'enabled' })).toBe('inherit')
  })
})

describe('parseTaxRateType', () => {
  test('有効な値 "standard" を正しく返す', () => {
    expect(parseTaxRateType('standard')).toBe('standard')
  })

  test('有効な値 "reduced" を正しく返す', () => {
    expect(parseTaxRateType('reduced')).toBe('reduced')
  })

  test('無効な文字列はデフォルト値 "standard" を返す', () => {
    expect(parseTaxRateType('invalid')).toBe('standard')
    expect(parseTaxRateType('REDUCED')).toBe('standard')
    expect(parseTaxRateType('')).toBe('standard')
  })

  test('文字列以外はデフォルト値 "standard" を返す', () => {
    expect(parseTaxRateType(123)).toBe('standard')
    expect(parseTaxRateType(null)).toBe('standard')
    expect(parseTaxRateType(undefined)).toBe('standard')
    expect(parseTaxRateType({ type: 'reduced' })).toBe('standard')
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

  test('混合型（boolean + 非boolean）はbooleanのみ抽出する', () => {
    const input = {
      wifi: true,
      parking: false,
      name: 'test',
      count: 123,
      accessible: true,
    }
    const result = parseBusinessAttributes(input)
    expect(result).toEqual({
      wifi: true,
      parking: false,
      accessible: true,
    })
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

  test('ネストされたオブジェクトのboolean値は無視される', () => {
    const input = {
      wifi: true,
      nested: { parking: true },
    }
    const result = parseBusinessAttributes(input)
    expect(result).toEqual({ wifi: true })
  })
})
