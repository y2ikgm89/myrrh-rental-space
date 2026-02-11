import { describe, test, expect } from 'bun:test'
import {
  // Schema factories
  createSafeUrlSchema,
  createCtaSchemas,
  createCtaButtonItemSchema,
  // Color validation
  optionalHexColorSchema,
  isValidHexColor,
  // Button types
  ctaButtonVariants,
  ctaButtonSizes,
  // Helpers
  transformLegacyCtaToButtons,
  transformCtaFields,
  // Section design schema
  sectionDesignSchema,
  defaultSectionDesign,
  parseSectionDesign,
  // Type guards
  isSectionAnimation,
  isTitleSize,
} from '@/shared/lib/validations/section-design'

// =============================================================================
// URL スキーマ
// =============================================================================

describe('createSafeUrlSchema', () => {
  test('有効なURL形式（http）', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('http://example.com')
    expect(result.success).toBe(true)
  })

  test('有効なURL形式（https）', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('https://example.com')
    expect(result.success).toBe(true)
  })

  test('有効な内部パス（/で始まる）', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('/about')
    expect(result.success).toBe(true)
  })

  test('空文字列は有効', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('')
    expect(result.success).toBe(true)
  })

  test('無効なURL形式でエラー', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('invalid-url')
    expect(result.success).toBe(false)
  })

  test('最大文字数制限', () => {
    const schema = createSafeUrlSchema(10)
    const result = schema.safeParse('https://example.com')
    expect(result.success).toBe(false)
  })

  test('ftpプロトコルは無効', () => {
    const schema = createSafeUrlSchema(500)
    const result = schema.safeParse('ftp://example.com')
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// CTA ボタンスキーマ（レガシー）
// =============================================================================

describe('createCtaSchemas', () => {
  const urlSchema = createSafeUrlSchema(500)
  const { ctaButtonSchema, optionalCtaButtonSchema } = createCtaSchemas(urlSchema)

  describe('ctaButtonSchema', () => {
    test('有効なデータでバリデーション成功', () => {
      const data = { text: 'ボタン', url: '/test' }
      const result = ctaButtonSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    test('textが空文字でエラー', () => {
      const data = { text: '', url: '/test' }
      const result = ctaButtonSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    test('text50文字超過でエラー', () => {
      const data = { text: 'a'.repeat(51), url: '/test' }
      const result = ctaButtonSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    test('無効なURLでエラー', () => {
      const data = { text: 'ボタン', url: 'invalid' }
      const result = ctaButtonSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('optionalCtaButtonSchema', () => {
    test('有効なデータでバリデーション成功', () => {
      const data = { text: 'ボタン', url: '/test' }
      const result = optionalCtaButtonSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    test('undefinedでバリデーション成功', () => {
      const result = optionalCtaButtonSchema.safeParse(undefined)
      expect(result.success).toBe(true)
    })

    test('空オブジェクトでバリデーション成功', () => {
      const result = optionalCtaButtonSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    test('textのみでバリデーション成功', () => {
      const data = { text: 'ボタン' }
      const result = optionalCtaButtonSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})

// =============================================================================
// HEXカラーバリデーション
// =============================================================================

describe('optionalHexColorSchema', () => {
  test('有効なHEXカラー（大文字）', () => {
    const result = optionalHexColorSchema.safeParse('#FFFFFF')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('#FFFFFF')
    }
  })

  test('有効なHEXカラー（小文字）', () => {
    const result = optionalHexColorSchema.safeParse('#ff0000')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('#ff0000')
    }
  })

  test('有効なHEXカラー（混在）', () => {
    const result = optionalHexColorSchema.safeParse('#FfAaBb')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('#FfAaBb')
    }
  })

  test('空文字列→undefinedに変換', () => {
    const result = optionalHexColorSchema.safeParse('')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }
  })

  test('3文字HEXは無効', () => {
    const result = optionalHexColorSchema.safeParse('#FFF')
    expect(result.success).toBe(false)
  })

  test('#なしは無効', () => {
    const result = optionalHexColorSchema.safeParse('FFFFFF')
    expect(result.success).toBe(false)
  })

  test('無効な文字を含むとエラー', () => {
    const result = optionalHexColorSchema.safeParse('#GGGGGG')
    expect(result.success).toBe(false)
  })
})

describe('isValidHexColor', () => {
  test('有効なHEXカラー', () => {
    expect(isValidHexColor('#FFFFFF')).toBe(true)
    expect(isValidHexColor('#ff0000')).toBe(true)
    expect(isValidHexColor('#AbCdEf')).toBe(true)
  })

  test('null/undefined/空文字はtrue', () => {
    expect(isValidHexColor(null)).toBe(true)
    expect(isValidHexColor(undefined)).toBe(true)
    expect(isValidHexColor('')).toBe(true)
  })

  test('無効なHEXカラー', () => {
    expect(isValidHexColor('#FFF')).toBe(false)
    expect(isValidHexColor('FFFFFF')).toBe(false)
    expect(isValidHexColor('#GGGGGG')).toBe(false)
  })
})

// =============================================================================
// CTAボタン配列スキーマ
// =============================================================================

describe('createCtaButtonItemSchema', () => {
  const urlSchema = createSafeUrlSchema(500)
  const schema = createCtaButtonItemSchema(urlSchema)

  test('有効なデータでバリデーション成功', () => {
    const data = {
      text: 'ボタン',
      url: '/test',
      variant: 'primary',
      size: 'lg',
      openInNewTab: true,
      backgroundColor: '#FF0000',
      textColor: '#FFFFFF',
    }
    const result = schema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('デフォルト値の適用', () => {
    const data = { text: 'ボタン', url: '/test' }
    const result = schema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.variant).toBe('primary')
      expect(result.data.size).toBe('lg')
      expect(result.data.openInNewTab).toBe(false)
    }
  })

  test('無効なvariantでエラー', () => {
    const data = { text: 'ボタン', url: '/test', variant: 'invalid' }
    const result = schema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('無効なsizeでエラー', () => {
    const data = { text: 'ボタン', url: '/test', size: 'xl' }
    const result = schema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('無効なHEXカラーでエラー', () => {
    const data = { text: 'ボタン', url: '/test', backgroundColor: '#FFF' }
    const result = schema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('カラー空文字列→undefinedに変換', () => {
    const data = { text: 'ボタン', url: '/test', backgroundColor: '' }
    const result = schema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.backgroundColor).toBeUndefined()
    }
  })
})

// =============================================================================
// レガシーCTA変換
// =============================================================================

describe('transformLegacyCtaToButtons', () => {
  test('ctaPrimaryのみ', () => {
    const result = transformLegacyCtaToButtons(
      { text: '主ボタン', url: '/primary' },
      undefined
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('主ボタン')
    expect(result[0]?.variant).toBe('primary')
  })

  test('ctaSecondaryのみ', () => {
    const result = transformLegacyCtaToButtons(
      undefined,
      { text: '副ボタン', url: '/secondary' }
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.text).toBe('副ボタン')
    expect(result[0]?.variant).toBe('secondary')
  })

  test('両方指定', () => {
    const result = transformLegacyCtaToButtons(
      { text: '主ボタン', url: '/primary' },
      { text: '副ボタン', url: '/secondary' }
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.variant).toBe('primary')
    expect(result[1]?.variant).toBe('secondary')
  })

  test('textまたはurlが欠けている場合は含まれない', () => {
    const result = transformLegacyCtaToButtons(
      { text: '', url: '/primary' },
      { text: '副ボタン', url: '' }
    )
    expect(result).toHaveLength(0)
  })
})

describe('transformCtaFields', () => {
  test('buttons配列が存在する場合はそのまま使用', () => {
    const input = {
      title: 'Test',
      buttons: [{ text: 'ボタン', url: '/test', variant: 'primary' as const, size: 'lg' as const, openInNewTab: false }],
      ctaPrimary: { text: '無視', url: '/ignore' },
    }
    const result = transformCtaFields(input)
    expect(result.buttons).toHaveLength(1)
    expect(result.buttons[0]?.text).toBe('ボタン')
  })

  test('buttons配列が空の場合はレガシーから変換', () => {
    const input = {
      title: 'Test',
      buttons: [],
      ctaPrimary: { text: '主ボタン', url: '/primary' },
      ctaSecondary: { text: '副ボタン', url: '/secondary' },
    }
    const result = transformCtaFields(input)
    expect(result.buttons).toHaveLength(2)
    expect(result.buttons[0]?.variant).toBe('primary')
  })

  test('buttonsなしの場合はレガシーから変換', () => {
    const input = {
      title: 'Test',
      ctaPrimary: { text: '主ボタン', url: '/primary' },
    }
    const result = transformCtaFields(input)
    expect(result.buttons).toHaveLength(1)
    expect(result.buttons[0]?.text).toBe('主ボタン')
  })

  test('レガシーフィールドは出力から除外', () => {
    const input = {
      title: 'Test',
      ctaPrimary: { text: '主ボタン', url: '/primary' },
    }
    const result = transformCtaFields(input)
    expect('ctaPrimary' in result).toBe(false)
    expect('ctaSecondary' in result).toBe(false)
  })
})

// =============================================================================
// セクション design スキーマ
// =============================================================================

describe('sectionDesignSchema', () => {
  test('有効なデータでバリデーション成功', () => {
    const data = {
      paddingTop: 'lg',
      paddingBottom: 'md',
      background: 'primary',
      backgroundImageUrl: 'https://example.com/bg.jpg',
      backgroundOverlayOpacity: 50,
      maxWidth: 'xl',
      titleColor: '#FF0000',
      titleSize: '2xl',
      textColor: '#333333',
      textAlign: 'center',
      animation: 'slide-up',
      customClass: 'custom-class',
    }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('デフォルト値の適用', () => {
    const result = sectionDesignSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.paddingTop).toBe('lg')
      expect(result.data.paddingBottom).toBe('lg')
      expect(result.data.background).toBe('default')
      expect(result.data.backgroundOverlayOpacity).toBe(0)
      expect(result.data.maxWidth).toBe('lg')
      expect(result.data.titleSize).toBe('lg')
      expect(result.data.textAlign).toBe('left')
      expect(result.data.animation).toBe('fade')
    }
  })

  test('無効なpaddingTop', () => {
    const data = { paddingTop: 'invalid' }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('無効なbackground', () => {
    const data = { background: 'invalid' }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('backgroundOverlayOpacity範囲外', () => {
    const invalid1 = { backgroundOverlayOpacity: -1 }
    const invalid2 = { backgroundOverlayOpacity: 101 }
    expect(sectionDesignSchema.safeParse(invalid1).success).toBe(false)
    expect(sectionDesignSchema.safeParse(invalid2).success).toBe(false)
  })

  test('無効なtitleSize', () => {
    const data = { titleSize: 'invalid' }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('無効なHEXカラー', () => {
    const data = { titleColor: '#FFF' }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('customClass最大文字数', () => {
    const data = { customClass: 'a'.repeat(201) }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  test('backgroundImageUrl空文字列は有効', () => {
    const data = { backgroundImageUrl: '' }
    const result = sectionDesignSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('parseSectionDesign', () => {
  test('有効なデータでパース成功', () => {
    const data = {
      paddingTop: 'xl',
      background: 'accent',
    }
    const result = parseSectionDesign(data)
    expect(result.paddingTop).toBe('xl')
    expect(result.background).toBe('accent')
  })

  test('無効なデータでデフォルト値を返す', () => {
    const data = {
      paddingTop: 'invalid',
    }
    const result = parseSectionDesign(data)
    expect(result).toEqual(defaultSectionDesign)
  })

  test('null/undefinedでデフォルト値を返す', () => {
    expect(parseSectionDesign(null)).toEqual(defaultSectionDesign)
    expect(parseSectionDesign(undefined)).toEqual(defaultSectionDesign)
  })
})

// =============================================================================
// 型ガード関数
// =============================================================================

describe('isSectionAnimation', () => {
  test('有効なアニメーション値', () => {
    expect(isSectionAnimation('none')).toBe(true)
    expect(isSectionAnimation('fade')).toBe(true)
    expect(isSectionAnimation('slide-up')).toBe(true)
    expect(isSectionAnimation('parallax')).toBe(true)
  })

  test('無効なアニメーション値', () => {
    expect(isSectionAnimation('invalid')).toBe(false)
    expect(isSectionAnimation('zoom')).toBe(false)
    expect(isSectionAnimation('')).toBe(false)
  })
})

describe('isTitleSize', () => {
  test('有効なタイトルサイズ', () => {
    expect(isTitleSize('sm')).toBe(true)
    expect(isTitleSize('md')).toBe(true)
    expect(isTitleSize('lg')).toBe(true)
    expect(isTitleSize('xl')).toBe(true)
    expect(isTitleSize('2xl')).toBe(true)
    expect(isTitleSize('3xl')).toBe(true)
  })

  test('無効なタイトルサイズ', () => {
    expect(isTitleSize('invalid')).toBe(false)
    expect(isTitleSize('xs')).toBe(false)
    expect(isTitleSize('4xl')).toBe(false)
    expect(isTitleSize('')).toBe(false)
  })
})

// =============================================================================
// デフォルト値
// =============================================================================

describe('defaultSectionDesign', () => {
  test('すべてのプロパティが定義されている', () => {
    expect(defaultSectionDesign.paddingTop).toBeDefined()
    expect(defaultSectionDesign.paddingBottom).toBeDefined()
    expect(defaultSectionDesign.background).toBeDefined()
    expect(defaultSectionDesign.backgroundOverlayOpacity).toBeDefined()
    expect(defaultSectionDesign.maxWidth).toBeDefined()
    expect(defaultSectionDesign.titleSize).toBeDefined()
    expect(defaultSectionDesign.textAlign).toBeDefined()
    expect(defaultSectionDesign.animation).toBeDefined()
  })

  test('デフォルト値が期待通り', () => {
    expect(defaultSectionDesign).toEqual({
      paddingTop: 'lg',
      paddingBottom: 'lg',
      background: 'default',
      backgroundOverlayOpacity: 0,
      maxWidth: 'lg',
      titleSize: 'lg',
      textAlign: 'left',
      animation: 'fade',
    })
  })
})

// =============================================================================
// 定数
// =============================================================================

describe('ctaButtonVariants', () => {
  test('すべてのバリアントが定義されている', () => {
    expect(ctaButtonVariants).toContain('primary')
    expect(ctaButtonVariants).toContain('secondary')
    expect(ctaButtonVariants).toContain('outline')
    expect(ctaButtonVariants).toContain('ghost')
    expect(ctaButtonVariants).toHaveLength(4)
  })
})

describe('ctaButtonSizes', () => {
  test('すべてのサイズが定義されている', () => {
    expect(ctaButtonSizes).toContain('sm')
    expect(ctaButtonSizes).toContain('md')
    expect(ctaButtonSizes).toContain('lg')
    expect(ctaButtonSizes).toHaveLength(3)
  })
})
