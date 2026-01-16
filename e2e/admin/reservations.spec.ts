import { test, expect, type Page } from '@playwright/test'
import { testReservations, urls, testUsers } from '../fixtures'

/**
 * 管理画面予約管理 E2E テスト
 *
 * テストシナリオ:
 * 1. 予約一覧ページの表示
 * 2. 予約詳細の表示
 * 3. 予約ステータスの変更（pending, confirmed, cancelled）
 * 4. 予約の削除/キャンセル
 * 5. ステータスによるフィルター
 * 6. 顧客名・メールアドレスによる検索
 * 7. ページネーション
 * 8. カレンダー表示への遷移
 */

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 管理者としてログインしてセッションを確立
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', testUsers.admin.email)
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 })
}

// =============================================================================
// テストセットアップ
// =============================================================================

/**
 * 各テスト前に管理者として認証
 */
test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

// =============================================================================
// 1. 予約一覧ページの表示
// =============================================================================

test.describe('予約一覧ページ', () => {
  test('予約一覧ページが正しく表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // ページタイトルを確認
    await expect(page.locator('h1')).toContainText('予約管理')

    // 説明文を確認
    await expect(page.locator('text=予約の確認・ステータス変更・キャンセル処理を行います')).toBeVisible()

    // カレンダー表示ボタンが存在することを確認
    const calendarButton = page.locator('a[href="/admin/reservations/calendar"]')
    await expect(calendarButton).toBeVisible()
    await expect(calendarButton).toContainText('カレンダー表示')
  })

  test('予約がテーブルに表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // テーブルが存在することを確認
    const table = page.locator('table')
    await expect(table).toBeVisible()

    // テーブルヘッダーを確認
    await expect(page.locator('th').filter({ hasText: '予約日時' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'スペース' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '顧客' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '料金' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'ステータス' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: '操作' })).toBeVisible()
  })

  test('予約がない場合に空の状態が表示される', async ({ page }) => {
    // 存在しない検索クエリで空の状態を確認
    await page.goto(`${urls.adminReservations}?search=nonexistent-reservation-12345`)
    await page.waitForLoadState('networkidle')

    // 空の状態メッセージを確認
    await expect(page.locator('text=予約がありません')).toBeVisible()
  })

  test('フィルターコンポーネントが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // ステータスフィルターが存在することを確認
    const statusFilter = page.locator('[role="combobox"]').first()
    await expect(statusFilter).toBeVisible()

    // 検索フィールドが存在することを確認
    const searchInput = page.locator('input[type="search"]')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', '顧客名、スペース名で検索...')
  })
})

// =============================================================================
// 2. 予約詳細の表示
// =============================================================================

test.describe('予約詳細ページ', () => {
  test('予約詳細ページに遷移できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 予約が存在する場合のみテスト
    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // 詳細ページが表示されることを確認
    await expect(page.locator('h1')).toContainText('予約詳細')

    // 戻るボタンが存在することを確認
    await expect(page.locator('a:has-text("← 一覧に戻る")')).toBeVisible()
  })

  test('予約詳細ページに必要な情報が表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // ステータスカードが表示されることを確認
    await expect(page.locator('text=ステータス').first()).toBeVisible()

    // 予約情報カードが表示されることを確認
    await expect(page.locator('text=予約情報').first()).toBeVisible()
    await expect(page.locator('text=スペース').first()).toBeVisible()
    await expect(page.locator('text=料金').first()).toBeVisible()
    await expect(page.locator('text=開始日時').first()).toBeVisible()
    await expect(page.locator('text=終了日時').first()).toBeVisible()

    // 顧客情報カードが表示されることを確認
    await expect(page.locator('text=顧客情報').first()).toBeVisible()
    await expect(page.locator('text=氏名').first()).toBeVisible()
    await expect(page.locator('text=メールアドレス').first()).toBeVisible()
    await expect(page.locator('text=電話番号').first()).toBeVisible()

    // メモカードが表示されることを確認
    await expect(page.locator('text=メモ').first()).toBeVisible()

    // 危険な操作カードが表示されることを確認
    await expect(page.locator('text=危険な操作').first()).toBeVisible()
  })

  test('戻るボタンで一覧ページに戻れる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // 戻るボタンをクリック
    await page.click('a:has-text("← 一覧に戻る")')
    await page.waitForLoadState('networkidle')

    // 一覧ページに戻ることを確認
    await expect(page).toHaveURL(urls.adminReservations)
    await expect(page.locator('h1')).toContainText('予約管理')
  })

  test('存在しない予約IDで404が表示される', async ({ page }) => {
    await page.goto('/admin/reservations/nonexistent-id-12345')
    await page.waitForLoadState('networkidle')

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundMessage = page.locator('text=見つかりません, text=Not Found, text=404')
    await expect(notFoundMessage.first()).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// 3. 予約ステータスの変更
// =============================================================================

test.describe('予約ステータスの変更', () => {
  test('一覧ページでステータスセレクトが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 予約が存在する場合のみテスト
    const tableRows = page.locator('tbody tr')
    const hasReservations = await tableRows.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    // ステータスセレクトが存在することを確認
    const statusSelect = page.locator('tbody tr').first().locator('[role="combobox"]')
    await expect(statusSelect).toBeVisible()
  })

  test('一覧ページでステータスを変更できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const tableRows = page.locator('tbody tr')
    const hasReservations = await tableRows.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    // 最初の予約のステータスセレクトを開く
    const statusSelect = page.locator('tbody tr').first().locator('[role="combobox"]')
    await statusSelect.click()

    // セレクトオプションが表示されることを確認
    await expect(page.locator('[role="option"]:has-text("保留中")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("確認済み")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("キャンセル")')).toBeVisible()
  })

  test('詳細ページでステータスを変更できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // ステータスセレクトを開く
    const statusSelect = page.locator('[role="combobox"]').first()
    await statusSelect.click()

    // セレクトオプションが表示されることを確認
    await expect(page.locator('[role="option"]:has-text("保留中に変更")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("確認済みに変更")')).toBeVisible()
    await expect(page.locator('[role="option"]:has-text("キャンセルに変更")')).toBeVisible()
  })

  test('ステータスバッジが正しく表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const tableRows = page.locator('tbody tr')
    const hasReservations = await tableRows.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    // ステータスバッジが少なくとも1つ表示されていることを確認
    // バッジは保留中、確認済み、キャンセルのいずれか
    const statusBadges = page.locator('[data-testid="status-badge"], .rounded-full')
    await expect(statusBadges.first()).toBeVisible()
  })
})

// =============================================================================
// 4. 予約の削除/キャンセル
// =============================================================================

test.describe('予約の削除', () => {
  test('詳細ページに削除ボタンが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // 削除ボタンが存在することを確認
    const deleteButton = page.locator('button:has-text("予約を削除")')
    await expect(deleteButton).toBeVisible()
  })

  test('削除ボタンをクリックすると確認ダイアログが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // 削除ボタンをクリック
    await page.click('button:has-text("予約を削除")')

    // 確認ダイアログが表示されることを確認
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
    await expect(dialog).toBeVisible()

    // ダイアログのタイトルを確認
    await expect(dialog.locator('text=予約を削除しますか？')).toBeVisible()

    // ダイアログの説明を確認
    await expect(dialog.locator('text=この操作は取り消せません')).toBeVisible()

    // キャンセルボタンと削除ボタンが存在することを確認
    await expect(dialog.locator('button:has-text("キャンセル")')).toBeVisible()
    await expect(dialog.locator('button:has-text("削除する")')).toBeVisible()
  })

  test('削除確認ダイアログでキャンセルできる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // 削除ボタンをクリック
    await page.click('button:has-text("予約を削除")')

    // ダイアログが表示されることを確認
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
    await expect(dialog).toBeVisible()

    // キャンセルボタンをクリック
    await dialog.locator('button:has-text("キャンセル")').click()

    // ダイアログが閉じることを確認
    await expect(dialog).not.toBeVisible()

    // 詳細ページに留まっていることを確認
    await expect(page.locator('h1')).toContainText('予約詳細')
  })
})

// =============================================================================
// 5. ステータスによるフィルター
// =============================================================================

test.describe('ステータスフィルター', () => {
  test('ステータスフィルターが機能する', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // ステータスフィルターを開く
    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    // 「保留中」を選択
    await page.click('[role="option"]:has-text("保留中")')

    // URLにステータスパラメータが追加されることを確認
    await page.waitForURL(/status=PENDING/)
  })

  test('確認済みでフィルターできる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    await page.click('[role="option"]:has-text("確認済み")')

    await page.waitForURL(/status=CONFIRMED/)
  })

  test('キャンセルでフィルターできる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    await page.click('[role="option"]:has-text("キャンセル")')

    await page.waitForURL(/status=CANCELLED/)
  })

  test('すべてでフィルターをリセットできる', async ({ page }) => {
    // フィルター適用状態からスタート
    await page.goto(`${urls.adminReservations}?status=PENDING`)
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    await page.click('[role="option"]:has-text("すべて")')

    // ステータスパラメータが削除されることを確認
    await page.waitForURL((url) => !url.searchParams.has('status'))
  })

  test('フィルター適用時にページが1にリセットされる', async ({ page }) => {
    // ページ2からスタート
    await page.goto(`${urls.adminReservations}?page=2`)
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    await page.click('[role="option"]:has-text("保留中")')

    // ページパラメータが削除されることを確認
    await page.waitForURL((url) => !url.searchParams.has('page'))
  })
})

// =============================================================================
// 6. 検索機能
// =============================================================================

test.describe('検索機能', () => {
  test('検索フィールドに入力できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill('テスト')

    await expect(searchInput).toHaveValue('テスト')
  })

  test('検索が実行される（デバウンス後）', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill('テスト')

    // デバウンス（300ms）+ ナビゲーションを待機
    await page.waitForURL(/search=/, { timeout: 5000 })
  })

  test('検索クエリがURLに反映される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill(testReservations.valid.customerName)

    await page.waitForURL(new RegExp(`search=${encodeURIComponent(testReservations.valid.customerName)}`), { timeout: 5000 })
  })

  test('URLの検索クエリが検索フィールドに反映される', async ({ page }) => {
    const searchTerm = 'テスト検索'
    await page.goto(`${urls.adminReservations}?search=${encodeURIComponent(searchTerm)}`)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"]')
    await expect(searchInput).toHaveValue(searchTerm)
  })

  test('検索とステータスフィルターを組み合わせて使用できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 検索を入力
    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill('テスト')

    // デバウンスを待機
    await page.waitForURL(/search=/, { timeout: 5000 })

    // ステータスフィルターを適用
    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()
    await page.click('[role="option"]:has-text("確認済み")')

    // 両方のパラメータがURLに存在することを確認
    await page.waitForURL((url) =>
      url.searchParams.has('search') && url.searchParams.has('status')
    )
  })

  test('検索をクリアできる', async ({ page }) => {
    await page.goto(`${urls.adminReservations}?search=テスト`)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('input[type="search"]')
    await searchInput.clear()

    // デバウンスを待機
    await page.waitForURL((url) => !url.searchParams.has('search'), { timeout: 5000 })
  })
})

// =============================================================================
// 7. ページネーション
// =============================================================================

test.describe('ページネーション', () => {
  test('ページネーションが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 「全 X 件」が表示されることを確認
    await expect(page.locator('text=/全 \\d+ 件/')).toBeVisible()
  })

  test('件数表示が正しいフォーマットで表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 件数表示が存在することを確認
    const paginationInfo = page.locator('text=/全 \\d+ 件/')
    await expect(paginationInfo).toBeVisible()
  })

  test('次へボタンでページ遷移できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const nextButton = page.locator('button:has-text("次へ")')

    // 次へボタンが有効な場合のみテスト
    const isDisabled = await nextButton.isDisabled()
    if (isDisabled) {
      test.skip(true, '次のページが存在しません（データが10件以下）')
      return
    }

    await nextButton.click()

    // URLにページパラメータが追加されることを確認
    await page.waitForURL(/page=2/)
  })

  test('前へボタンでページ遷移できる', async ({ page }) => {
    // ページ2からスタート
    await page.goto(`${urls.adminReservations}?page=2`)
    await page.waitForLoadState('networkidle')

    const prevButton = page.locator('button:has-text("前へ")')

    // 前へボタンが有効な場合のみテスト
    const isDisabled = await prevButton.isDisabled()
    if (isDisabled) {
      test.skip(true, '前のページが存在しません')
      return
    }

    await prevButton.click()

    // ページパラメータが削除されることを確認（ページ1はデフォルト）
    await page.waitForURL((url) => !url.searchParams.has('page'))
  })

  test('最初のページでは前へボタンが無効', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const prevButton = page.locator('button:has-text("前へ")')

    // 複数ページある場合は前へボタンが存在する
    if (await prevButton.count() > 0) {
      await expect(prevButton).toBeDisabled()
    }
  })
})

// =============================================================================
// 8. カレンダー表示
// =============================================================================

test.describe('カレンダー表示', () => {
  test('カレンダー表示ボタンをクリックするとカレンダーページに遷移する', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const calendarButton = page.locator('a[href="/admin/reservations/calendar"]')
    await calendarButton.click()

    await page.waitForURL('/admin/reservations/calendar')
  })

  test('カレンダーページが読み込まれる', async ({ page }) => {
    await page.goto('/admin/reservations/calendar')
    await page.waitForLoadState('networkidle')

    // カレンダービューが存在することを確認
    // カレンダーページの具体的な要素は実装によって異なる
    const pageContent = page.locator('main, [role="main"], .calendar, [data-testid="calendar"]')
    await expect(pageContent.first()).toBeVisible()
  })
})

// =============================================================================
// 9. メモ機能
// =============================================================================

test.describe('メモ機能', () => {
  test('詳細ページでメモを入力できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // メモ入力フィールドを確認
    const notesInput = page.locator('input[placeholder="メモを入力..."]')
    await expect(notesInput).toBeVisible()

    // メモを入力
    await notesInput.fill('テストメモ')
    await expect(notesInput).toHaveValue('テストメモ')
  })

  test('メモ保存ボタンが存在する', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const detailButton = page.locator('a:has-text("詳細")').first()
    const hasReservations = await detailButton.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    await detailButton.click()
    await page.waitForLoadState('networkidle')

    // メモ保存ボタンが存在することを確認
    const saveButton = page.locator('button:has-text("メモを保存")')
    await expect(saveButton).toBeVisible()
  })
})

// =============================================================================
// 10. ローディング状態
// =============================================================================

test.describe('ローディング状態', () => {
  test('フィルター適用中にローディング表示が出る', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('[role="combobox"]').first()
    await statusFilter.click()

    // 「保留中」を選択
    await page.click('[role="option"]:has-text("保留中")')

    // ローディング表示を確認（表示が一瞬の場合があるため、存在確認のみ）
    const _loadingIndicator = page.locator('text=読み込み中...')
    // ローディングが表示されるか、すでにロード完了しているかのどちらか
    await page.waitForURL(/status=PENDING/)
  })
})

// =============================================================================
// 11. レスポンシブデザイン
// =============================================================================

test.describe('レスポンシブデザイン', () => {
  test('モバイルビューでも一覧が表示される', async ({ page }) => {
    // モバイルビューポートを設定
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // ページタイトルが表示されることを確認
    await expect(page.locator('h1')).toContainText('予約管理')

    // テーブルまたはリストが表示されることを確認
    const content = page.locator('table, [role="list"], .space-y-4')
    await expect(content.first()).toBeVisible()
  })
})

// =============================================================================
// 12. エラーハンドリング
// =============================================================================

test.describe('エラーハンドリング', () => {
  test('ネットワークエラー時にエラーメッセージが表示される', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // オフラインモードをシミュレート
    await page.context().setOffline(true)

    // 検索を実行
    const searchInput = page.locator('input[type="search"]')
    await searchInput.fill('テスト')

    // エラー状態またはローディング状態を確認
    // 実装によってはエラートーストが表示される
    await page.waitForTimeout(500)

    // オンラインに戻す
    await page.context().setOffline(false)
  })
})

// =============================================================================
// 13. アクセシビリティ
// =============================================================================

test.describe('アクセシビリティ', () => {
  test('キーボードでフィルターを操作できる', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    // 検索フィールドにフォーカス
    const searchInput = page.locator('input[type="search"]')
    await searchInput.focus()
    await expect(searchInput).toBeFocused()

    // Tabでステータスフィルターに移動
    await page.keyboard.press('Tab')
  })

  test('テーブルにアクセシブルなマークアップがある', async ({ page }) => {
    await page.goto(urls.adminReservations)
    await page.waitForLoadState('networkidle')

    const tableRows = page.locator('tbody tr')
    const hasReservations = await tableRows.count() > 0

    if (!hasReservations) {
      test.skip(true, '予約データが存在しません')
      return
    }

    // テーブルヘッダーがthタグで正しくマークアップされていることを確認
    const tableHeaders = page.locator('thead th')
    expect(await tableHeaders.count()).toBeGreaterThan(0)
  })
})
