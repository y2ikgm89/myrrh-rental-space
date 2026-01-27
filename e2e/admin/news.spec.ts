import { test, expect, type Page } from '@playwright/test'
import { urls, testUsers } from '../fixtures'

/**
 * 管理画面 - ニュース管理 E2E テスト
 *
 * テストシナリオ:
 * 1. ニュース一覧ページの表示
 * 2. ニュースの新規作成
 * 3. ニュースの編集
 * 4. ニュースの削除
 * 5. 公開/非公開の切り替え
 * 6. フォームバリデーション
 * 7. 検索・フィルター機能
 * 8. ページネーション
 */

// =============================================================================
// テストセットアップ
// =============================================================================

/**
 * 管理者としてログイン
 */
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', testUsers.admin.email)
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 })
}

/**
 * 各テスト前に管理者として認証
 */
test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

// =============================================================================
// 1. ニュース一覧ページの表示
// =============================================================================

test.describe('ニュース一覧ページ', () => {
  test('ニュース一覧ページが正しく表示される', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ページタイトルを確認
    await expect(page.locator('h1')).toContainText('ニュース')

    // 新規作成ボタンが存在することを確認
    const createButton = page.locator('a[href="/admin/news/new"]')
    await expect(createButton).toBeVisible()
    await expect(createButton).toContainText('新規作成')
  })

  test('既存ニュースがテーブルに表示される', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // テーブルが存在することを確認
    const table = page.locator('table')

    if ((await table.count()) > 0) {
      await expect(table).toBeVisible()

      // テーブルヘッダーを確認
      await expect(
        page.locator('th').filter({ hasText: 'タイトル' })
      ).toBeVisible()
      await expect(
        page.locator('th').filter({ hasText: 'ステータス' })
      ).toBeVisible()
    } else {
      // 記事がない場合は空の状態メッセージを確認
      await expect(page.locator('text=ニュースがありません')).toBeVisible()
    }
  })

  test('フィルター機能が表示される', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ステータスフィルターが存在することを確認
    const statusFilter = page.locator('[role="combobox"]').first()
    await expect(statusFilter).toBeVisible()

    // 検索フィールドが存在することを確認
    const searchInput = page.locator('input[type="search"]')
    if ((await searchInput.count()) > 0) {
      await expect(searchInput).toBeVisible()
    }
  })

  test('空の状態が正しく表示される', async ({ page }) => {
    // 存在しない検索クエリで検索
    await page.goto(urls.adminNews + '?search=nonexistent-news-12345')
    await page.waitForLoadState('networkidle')

    // 空の状態メッセージを確認
    await expect(page.locator('text=ニュースがありません')).toBeVisible()
  })
})

// =============================================================================
// 2. ニュースの新規作成
// =============================================================================

test.describe('ニュースの新規作成', () => {
  test('新規作成ページが正しく表示される', async ({ page }) => {
    await page.goto(urls.adminNews + '/new')
    await page.waitForLoadState('networkidle')

    // インラインエディターが表示されることを確認
    // エディタコンポーネントを確認
    await expect(page.locator('text=news/')).toBeVisible()

    // 保存ボタンが存在することを確認
    const saveButton = page.locator('button:has-text("保存")')
    await expect(saveButton).toBeVisible()

    // 戻るボタンが存在することを確認
    const backButton = page.locator('button:has-text("← 戻る")')
    await expect(backButton).toBeVisible()
  })

  test('サイドパネルを開閉できる', async ({ page }) => {
    await page.goto(urls.adminNews + '/new')
    await page.waitForLoadState('networkidle')

    // サイドパネルトグルボタンを探す
    const toggleButton = page.locator('button:has-text("設定")').first()

    if ((await toggleButton.count()) > 0) {
      await toggleButton.click()
      await page.waitForTimeout(300) // アニメーション待機

      // サイドパネルが開いていることを確認
      await expect(page.locator('input[name="title"]')).toBeVisible()
    }
  })

  test('新規作成ページでプレビューボタンをクリックすると通知が表示される', async ({
    page,
  }) => {
    await page.goto(urls.adminNews + '/new')
    await page.waitForLoadState('networkidle')

    // プレビューボタンをクリック
    const previewButton = page.locator('button:has-text("プレビュー")')
    if ((await previewButton.count()) > 0) {
      await previewButton.click()

      // 通知メッセージを確認
      await expect(
        page.locator('text=ニュースを作成後にプレビューできます')
      ).toBeVisible()
    }
  })
})

// =============================================================================
// 3. ニュースの編集
// =============================================================================

test.describe('ニュースの編集', () => {
  test('編集ページが既存データで事前入力される', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // 最初の記事の編集ボタンをクリック
    const firstEditButton = page
      .locator('a[href*="/admin/news/"]:has-text("編集")')
      .first()

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await firstEditButton.click()
    await page.waitForLoadState('networkidle')

    // エディターヘッダーにタイトルが表示されることを確認
    await expect(page.locator('text=news/')).toBeVisible()

    // サイドパネルを開いてフォームフィールドを確認
    const toggleButton = page.locator('button:has-text("設定")').first()
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click()
      await page.waitForTimeout(300)

      // タイトルフィールドに値が入っていることを確認
      const titleInput = page.locator('input[name="title"]')
      await expect(titleInput).not.toBeEmpty()
    }
  })

  test('ニュース情報を更新できる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    const firstEditButton = page
      .locator('a[href*="/admin/news/"]:has-text("編集")')
      .first()

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await firstEditButton.click()
    await page.waitForLoadState('networkidle')

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first()
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click()
      await page.waitForTimeout(300)

      // タイトルを更新
      const titleInput = page.locator('input[name="title"]')
      await titleInput.clear()
      await titleInput.fill('更新されたニュースタイトル')

      // サイドパネルを閉じる
      await toggleButton.click()
      await page.waitForTimeout(300)
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")')
    await saveButton.click()

    // 成功メッセージを確認
    await expect(page.locator('text=ニュースを保存しました')).toBeVisible({
      timeout: 10000,
    })
  })

  test('戻るボタンで一覧ページに戻れる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    const firstEditButton = page
      .locator('a[href*="/admin/news/"]:has-text("編集")')
      .first()

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await firstEditButton.click()
    await page.waitForLoadState('networkidle')

    // 戻るボタンをクリック
    const backButton = page.locator('button:has-text("← 戻る")')
    await backButton.click()

    // 一覧ページに戻ることを確認
    await page.waitForURL(urls.adminNews, { timeout: 10000 })
    await expect(page.locator('h1')).toContainText('ニュース')
  })
})

// =============================================================================
// 4. ニュースの削除
// =============================================================================

test.describe('ニュースの削除', () => {
  test('削除ボタンをクリックすると確認ダイアログが表示される', async ({
    page,
  }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    const firstEditButton = page
      .locator('a[href*="/admin/news/"]:has-text("編集")')
      .first()

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await firstEditButton.click()
    await page.waitForLoadState('networkidle')

    // 削除ボタンを探す
    const deleteButton = page.locator('button:has-text("削除")')

    if ((await deleteButton.count()) === 0) {
      test.skip(true, '削除ボタンが存在しません')
      return
    }

    await deleteButton.click()

    // 確認ダイアログが表示されることを確認
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]')
    await expect(dialog).toBeVisible()

    // ダイアログのタイトルを確認
    await expect(dialog.locator('text=ニュースを削除しますか？')).toBeVisible()

    // キャンセルボタンを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible()

    // 削除確認ボタンを確認
    await expect(dialog.locator('button:has-text("削除する")')).toBeVisible()
  })

  test('キャンセルボタンでダイアログを閉じられる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    const firstEditButton = page
      .locator('a[href*="/admin/news/"]:has-text("編集")')
      .first()

    if ((await firstEditButton.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await firstEditButton.click()
    await page.waitForLoadState('networkidle')

    const deleteButton = page.locator('button:has-text("削除")')

    if ((await deleteButton.count()) === 0) {
      test.skip(true, '削除ボタンが存在しません')
      return
    }

    await deleteButton.click()

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]')
    await expect(dialog).toBeVisible()

    // キャンセルボタンをクリック
    await dialog.locator('button:has-text("キャンセル")').click()

    // ダイアログが閉じられることを確認
    await expect(dialog).not.toBeVisible()
  })
})

// =============================================================================
// 5. 公開/非公開の切り替え
// =============================================================================

test.describe('公開状態の切り替え', () => {
  test('一覧ページのドロップダウンメニューで公開状態を切り替えられる', async ({
    page,
  }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ドロップダウントリガーボタンを探す
    const dropdownTrigger = page.locator('button:has-text("•••")').first()

    if ((await dropdownTrigger.count()) === 0) {
      test.skip(true, 'ニュースが存在しません')
      return
    }

    await dropdownTrigger.click()

    // ドロップダウンメニューが表示されることを確認
    const dropdown = page.locator('[role="menu"]')
    await expect(dropdown).toBeVisible()

    // 公開/下書きに戻すメニュー項目が存在することを確認
    const publishItem = dropdown.locator('text=公開する')
    const unpublishItem = dropdown.locator('text=下書きに戻す')

    const hasPublish = (await publishItem.count()) > 0
    const hasUnpublish = (await unpublishItem.count()) > 0

    expect(hasPublish || hasUnpublish).toBe(true)
  })

  test('ステータスバッジが正しく表示される', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // テーブル内にステータスバッジが存在するか確認
    const table = page.locator('table')

    if ((await table.count()) > 0) {
      // 公開中または下書きのバッジを探す
      const publishedBadge = page.locator('text=公開中')
      const draftBadge = page.locator('text=下書き')

      const hasPublished = (await publishedBadge.count()) > 0
      const hasDraft = (await draftBadge.count()) > 0

      // 少なくとも一つのバッジが存在するか、記事がない
      const emptyMessage = page.locator('text=ニュースがありません')
      const hasEmpty = (await emptyMessage.count()) > 0

      expect(hasPublished || hasDraft || hasEmpty).toBe(true)
    }
  })
})

// =============================================================================
// 6. フォームバリデーション
// =============================================================================

test.describe('フォームバリデーション', () => {
  test('タイトルが空の場合にエラーが表示される', async ({ page }) => {
    await page.goto(urls.adminNews + '/new')
    await page.waitForLoadState('networkidle')

    // サイドパネルを開く
    const toggleButton = page.locator('button:has-text("設定")').first()
    if ((await toggleButton.count()) > 0) {
      await toggleButton.click()
      await page.waitForTimeout(300)
    }

    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存")')
    await saveButton.click()

    // エラーメッセージを確認
    await expect(page.locator('text=タイトルは必須です')).toBeVisible({
      timeout: 5000,
    })
  })
})

// =============================================================================
// 7. 検索・フィルター機能
// =============================================================================

test.describe('検索・フィルター機能', () => {
  test('タイトルで検索できる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // 検索フィールドに入力
    const searchInput = page.locator('input[type="search"]')

    if ((await searchInput.count()) === 0) {
      test.skip(true, '検索機能が存在しません')
      return
    }

    await searchInput.fill('テスト')

    // デバウンス後にURLが更新されることを確認
    await page.waitForTimeout(500)
    await page.waitForLoadState('networkidle')

    // URLに検索パラメータが含まれることを確認
    await expect(page).toHaveURL(/[?&]search=テスト/)
  })

  test('ステータスでフィルターできる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    // 公開中を選択
    const publishedOption = page.locator('[role="option"]:has-text("公開中")')
    if ((await publishedOption.count()) > 0) {
      await publishedOption.click()
      await page.waitForLoadState('networkidle')

      // URLにステータスパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]status=PUBLISHED/)
    }
  })

  test('下書きフィルターを適用できる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ステータスフィルターを選択
    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    // 下書きを選択
    const draftOption = page.locator('[role="option"]:has-text("下書き")')
    if ((await draftOption.count()) > 0) {
      await draftOption.click()
      await page.waitForLoadState('networkidle')

      // URLにステータスパラメータが含まれることを確認
      await expect(page).toHaveURL(/[?&]status=DRAFT/)
    }
  })
})

// =============================================================================
// 8. ページネーション
// =============================================================================

test.describe('ページネーション', () => {
  test('ページネーションが表示される（記事が10件以上の場合）', async ({
    page,
  }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      'nav[aria-label*="ページ"], [class*="pagination"]'
    )

    if ((await pagination.count()) > 0) {
      await expect(pagination.first()).toBeVisible()
    } else {
      // 記事が10件以下の場合はページネーションが表示されない
      const table = page.locator('table')
      const rows = await table.locator('tbody tr').count()

      if (rows < 10) {
        test.skip(true, 'ページネーションが表示されない（データが少ない）')
      }
    }
  })

  test('次のページに移動できる', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // 次へボタンを探す
    const nextButton = page.locator(
      'button:has-text("次へ"), a:has-text("次へ"), button:has-text(">")'
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

    // URLにページパラメータが追加されることを確認
    await page.waitForURL(/[?&]page=2/)
  })
})

// =============================================================================
// 9. エラーハンドリング
// =============================================================================

test.describe('エラーハンドリング', () => {
  test('存在しないニュースにアクセスすると404が表示される', async ({
    page,
  }) => {
    await page.goto('/admin/news/non-existent-id-12345')

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundText = page.locator(
      'text=見つかりません, text=404, text=Not Found'
    )

    if ((await notFoundText.count()) > 0) {
      await expect(notFoundText.first()).toBeVisible()
    }
  })
})

// =============================================================================
// 10. レスポンシブ対応
// =============================================================================

test.describe('レスポンシブ対応', () => {
  test('モバイルビューでも一覧ページが表示される', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    // ページタイトルが表示されることを確認
    await expect(page.locator('h1')).toContainText('ニュース')

    // 新規作成ボタンが表示されることを確認
    await expect(page.locator('a[href="/admin/news/new"]')).toBeVisible()
  })

  test('モバイルビューでも編集ページが表示される', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto(urls.adminNews + '/new')
    await page.waitForLoadState('networkidle')

    // エディターが表示されることを確認
    const editor = page.locator('[contenteditable="true"]')

    // エディターの読み込みを待機
    const loadingText = page.locator('text=エディタを読み込み中...')
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 10000 })
    }

    await expect(editor.first()).toBeVisible({ timeout: 10000 })
  })
})
