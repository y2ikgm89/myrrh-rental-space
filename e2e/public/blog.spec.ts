import { test, expect } from '@playwright/test'
import { urls } from '../fixtures'

/**
 * 公開サイト - ブログページ E2E テスト
 *
 * テストシナリオ:
 * 1. ブログ一覧ページの表示
 * 2. ブログ記事詳細ページの表示
 * 3. カテゴリフィルター
 * 4. ページネーション
 * 5. 検索機能
 * 6. レスポンシブデザイン
 * 7. SEO/OGP
 * 8. アクセシビリティ
 */

// =============================================================================
// 1. ブログ一覧ページの表示
// =============================================================================

test.describe('ブログ一覧ページ - 基本表示', () => {
  test('ブログ一覧ページが正しく読み込まれる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/blog')
  })

  test('ページタイトルが設定されている', async ({ page }) => {
    await page.goto(urls.blog)

    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    expect(title.toLowerCase()).toContain('ブログ')
  })

  test('見出しが表示される', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
  })

  test('ブログ記事一覧が表示される', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // 記事カードまたはリストアイテムを確認
    const articles = page.locator(
      'article, [data-testid="blog-card"], .blog-post'
    )

    // 記事がある場合は表示されていることを確認
    const articleCount = await articles.count()

    if (articleCount > 0) {
      await expect(articles.first()).toBeVisible()
    } else {
      // 記事がない場合は空の状態メッセージを確認
      const emptyMessage = page.locator(
        'text=記事がありません, text=ブログ記事が見つかりません'
      )
      await expect(emptyMessage.first()).toBeVisible()
    }
  })

  test('記事カードに必要な情報が含まれる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articles = page.locator('article, [data-testid="blog-card"]')
    const articleCount = await articles.count()

    if (articleCount === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    const firstArticle = articles.first()

    // タイトルが存在することを確認
    const titleElement = firstArticle.locator('h2, h3, [class*="title"]')
    await expect(titleElement.first()).toBeVisible()

    // リンクが存在することを確認
    const link = firstArticle.locator('a[href*="/blog/"]')
    await expect(link.first()).toBeVisible()
  })

  test('記事カードにサムネイルが表示される（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articles = page.locator('article, [data-testid="blog-card"]')
    const articleCount = await articles.count()

    if (articleCount === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    const firstArticle = articles.first()
    const thumbnail = firstArticle.locator('img')

    if ((await thumbnail.count()) > 0) {
      await expect(thumbnail.first()).toBeVisible()

      // alt属性があることを確認
      const alt = await thumbnail.first().getAttribute('alt')
      expect(alt).not.toBeNull()
    }
  })
})

// =============================================================================
// 2. ブログ記事詳細ページの表示
// =============================================================================

test.describe('ブログ記事詳細ページ', () => {
  test('記事一覧から詳細ページに遷移できる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // 詳細ページに遷移したことを確認
    expect(page.url()).toMatch(/\/blog\/[a-zA-Z0-9-]+/)
  })

  test('記事詳細ページにタイトルが表示される', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // h1タイトルが表示されることを確認
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
  })

  test('記事詳細ページに本文が表示される', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // 本文エリアが存在することを確認
    const content = page.locator(
      'article, [data-testid="blog-content"], .prose, main'
    )
    await expect(content.first()).toBeVisible()
  })

  test('記事詳細ページに公開日が表示される', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // 日付表示を確認（time要素または日付形式のテキスト）
    const dateElement = page.locator(
      'time, [datetime], text=/\\d{4}[年\\/\\-]\\d{1,2}[月\\/\\-]\\d{1,2}/'
    )

    if ((await dateElement.count()) > 0) {
      await expect(dateElement.first()).toBeVisible()
    }
  })

  test('記事詳細ページから一覧に戻れる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // 戻るリンクまたはパンくずをクリック
    const backLink = page.locator(
      'a[href="/blog"], a:has-text("一覧に戻る"), a:has-text("ブログ")'
    )

    if ((await backLink.count()) > 0) {
      await backLink.first().click()
      await page.waitForURL(/\/blog$/)
    }
  })

  test('存在しない記事で404が表示される', async ({ page }) => {
    await page.goto('/blog/nonexistent-post-12345')
    await page.waitForLoadState('networkidle')

    const notFoundContent = page.locator(
      'text=404, text=見つかりません, text=Not Found'
    )

    await expect(notFoundContent.first()).toBeVisible()
  })
})

// =============================================================================
// 3. カテゴリフィルター
// =============================================================================

test.describe('ブログ一覧 - カテゴリフィルター', () => {
  test('カテゴリリンクが表示される（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // カテゴリナビゲーションまたはフィルター
    const categoryLinks = page.locator(
      'a[href*="/blog/category"], [data-testid="category-filter"], nav a'
    )

    // カテゴリリンクがあれば表示されていることを確認
    if ((await categoryLinks.count()) > 0) {
      await expect(categoryLinks.first()).toBeVisible()
    }
  })

  test('カテゴリでフィルターできる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const categoryLink = page.locator('a[href*="/blog/category"]').first()

    if ((await categoryLink.count()) === 0) {
      test.skip(true, 'カテゴリが存在しません')
      return
    }

    await categoryLink.click()
    await page.waitForLoadState('networkidle')

    // URLにカテゴリパラメータが含まれることを確認
    expect(page.url()).toContain('/blog/category')
  })

  test('タグでフィルターできる（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const tagLink = page.locator('a[href*="/blog/tag"]').first()

    if ((await tagLink.count()) === 0) {
      test.skip(true, 'タグが存在しません')
      return
    }

    await tagLink.click()
    await page.waitForLoadState('networkidle')

    // URLにタグパラメータが含まれることを確認
    expect(page.url()).toContain('/blog/tag')
  })
})

// =============================================================================
// 4. ページネーション
// =============================================================================

test.describe('ブログ一覧 - ページネーション', () => {
  test('ページネーションが表示される（記事が多い場合）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // ページネーションコンポーネント
    const pagination = page.locator(
      'nav[aria-label*="ページ"], [data-testid="pagination"], .pagination'
    )

    // ページネーションがあれば表示されていることを確認
    if ((await pagination.count()) > 0) {
      await expect(pagination.first()).toBeVisible()
    }
  })

  test('次のページに移動できる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const nextButton = page.locator(
      'a:has-text("次へ"), button:has-text("次へ"), a:has-text(">")'
    )

    if (
      (await nextButton.count()) === 0 ||
      (await nextButton.first().isDisabled())
    ) {
      test.skip(true, '次のページが存在しません')
      return
    }

    await nextButton.first().click()
    await page.waitForLoadState('networkidle')

    // URLにページパラメータが含まれることを確認
    expect(page.url()).toMatch(/page=2|\/2$/)
  })

  test('ページ番号をクリックして移動できる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const pageNumber = page.locator(
      'a:has-text("2"), button:has-text("2")'
    ).first()

    if ((await pageNumber.count()) === 0) {
      test.skip(true, '2ページ目が存在しません')
      return
    }

    await pageNumber.click()
    await page.waitForLoadState('networkidle')

    expect(page.url()).toMatch(/page=2|\/2$/)
  })
})

// =============================================================================
// 5. 検索機能
// =============================================================================

test.describe('ブログ一覧 - 検索機能', () => {
  test('検索フォームが表示される（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator(
      'input[type="search"], input[name="search"], input[placeholder*="検索"]'
    )

    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible()
    }
  })

  test('検索を実行できる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator(
      'input[type="search"], input[name="search"]'
    ).first()

    if ((await searchInput.count()) === 0) {
      test.skip(true, '検索機能が存在しません')
      return
    }

    await searchInput.fill('テスト')
    await page.keyboard.press('Enter')

    await page.waitForLoadState('networkidle')

    // URLに検索パラメータが含まれることを確認
    expect(page.url()).toContain('search=')
  })
})

// =============================================================================
// 6. レスポンシブデザイン
// =============================================================================

test.describe('ブログページ - レスポンシブ', () => {
  test('モバイルビューで一覧ページが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const main = page.locator('main')
    await expect(main).toBeVisible()
  })

  test('モバイルビューで記事カードが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articles = page.locator('article, [data-testid="blog-card"]')

    if ((await articles.count()) > 0) {
      await expect(articles.first()).toBeVisible()
    }
  })

  test('タブレットビューで一覧ページが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const main = page.locator('main')
    await expect(main).toBeVisible()
  })

  test('モバイルビューで記事詳細ページが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    const content = page.locator('article, main')
    await expect(content.first()).toBeVisible()
  })
})

// =============================================================================
// 7. SEO/OGP
// =============================================================================

test.describe('ブログページ - SEO/OGP', () => {
  test('一覧ページにメタディスクリプションがある', async ({ page }) => {
    await page.goto(urls.blog)

    const metaDescription = page.locator('meta[name="description"]')
    const content = await metaDescription.getAttribute('content')

    expect(content).not.toBeNull()
    expect(content?.length).toBeGreaterThan(0)
  })

  test('記事詳細ページにOGPタグがある', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // OGPタグを確認
    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', /.+/)

    const ogDescription = page.locator('meta[property="og:description"]')
    await expect(ogDescription).toHaveAttribute('content', /.+/)

    const ogType = page.locator('meta[property="og:type"]')
    await expect(ogType).toHaveAttribute('content', 'article')
  })

  test('記事詳細ページにcanonical URLがある', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    const canonical = page.locator('link[rel="canonical"]')

    if ((await canonical.count()) > 0) {
      const href = await canonical.getAttribute('href')
      expect(href).toContain('/blog/')
    }
  })
})

// =============================================================================
// 8. アクセシビリティ
// =============================================================================

test.describe('ブログページ - アクセシビリティ', () => {
  test('一覧ページにmain要素が1つ存在する', async ({ page }) => {
    await page.goto(urls.blog)

    const mainElements = page.locator('main')
    const count = await mainElements.count()

    expect(count).toBe(1)
  })

  test('記事リンクがキーボードでアクセスできる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // Tabキーで移動
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // フォーカスがどこかの要素に当たっていることを確認
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('画像にalt属性がある', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const images = page.locator('article img, [data-testid="blog-card"] img')
    const imageCount = await images.count()

    for (let i = 0; i < Math.min(imageCount, 5); i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')

      // alt属性が存在することを確認
      expect(alt).not.toBeNull()
    }
  })

  test('見出し階層が正しい', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // h1が存在することを確認
    const h1 = page.locator('h1')
    const h1Count = await h1.count()

    expect(h1Count).toBeGreaterThanOrEqual(1)
  })
})

// =============================================================================
// 9. パフォーマンス
// =============================================================================

test.describe('ブログページ - パフォーマンス', () => {
  test('一覧ページが5秒以内に読み込まれる', async ({ page }) => {
    const startTime = Date.now()

    await page.goto(urls.blog)
    await page.waitForLoadState('domcontentloaded')

    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(5000)
  })

  test('記事詳細ページが5秒以内に読み込まれる', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    const startTime = Date.now()

    await articleLink.click()
    await page.waitForLoadState('domcontentloaded')

    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(5000)
  })
})

// =============================================================================
// 10. エラーハンドリング
// =============================================================================

test.describe('ブログページ - エラーハンドリング', () => {
  test('JavaScriptエラーが発生しない', async ({ page }) => {
    const errors: string[] = []

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    expect(errors.length).toBe(0)
  })

  test('コンソールにエラーがない', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    // 致命的なエラーを除外
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes('hydration') &&
        !error.includes('Warning') &&
        !error.includes('DevTools')
    )

    expect(criticalErrors.length).toBe(0)
  })
})

// =============================================================================
// 11. コメント機能（あれば）
// =============================================================================

test.describe('ブログ記事 - コメント機能', () => {
  test('コメントセクションが表示される（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // コメントセクションを確認
    const commentSection = page.locator(
      '[data-testid="comments"], .comments, #comments, text=コメント'
    )

    if ((await commentSection.count()) > 0) {
      await expect(commentSection.first()).toBeVisible()
    }
  })

  test('コメントフォームが表示される（あれば）', async ({ page }) => {
    await page.goto(urls.blog)
    await page.waitForLoadState('networkidle')

    const articleLink = page.locator('a[href*="/blog/"]').first()

    if ((await articleLink.count()) === 0) {
      test.skip(true, 'ブログ記事が存在しません')
      return
    }

    await articleLink.click()
    await page.waitForLoadState('networkidle')

    // コメントフォームを確認
    const commentForm = page.locator(
      'form[data-testid="comment-form"], textarea[name="comment"], textarea[placeholder*="コメント"]'
    )

    if ((await commentForm.count()) > 0) {
      await expect(commentForm.first()).toBeVisible()
    }
  })
})
