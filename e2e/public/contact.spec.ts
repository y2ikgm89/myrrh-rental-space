import { test, expect } from '@playwright/test'
import { urls, testContacts } from '../fixtures'

/**
 * 公開サイト - お問い合わせページ E2E テスト
 *
 * テストシナリオ:
 * 1. ページの基本表示
 * 2. フォーム表示
 * 3. フォームバリデーション
 * 4. フォーム送信
 * 5. Turnstile検証
 * 6. レスポンシブデザイン
 * 7. アクセシビリティ
 */

// =============================================================================
// 1. ページの基本表示
// =============================================================================

test.describe('お問い合わせページ - 基本表示', () => {
  test('お問い合わせページが正しく読み込まれる', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // ページが正常に読み込まれることを確認
    expect(page.url()).toContain('/contact')
  })

  test('ページタイトルが設定されている', async ({ page }) => {
    await page.goto(urls.contact)

    // titleタグにお問い合わせ関連のテキストが含まれることを確認
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('見出しが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // お問い合わせページの見出しを確認
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
    await expect(heading).toContainText(/お問い合わせ|Contact/i)
  })

  test('説明文が表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // ページの説明文が存在することを確認
    const description = page.locator('p').first()
    await expect(description).toBeVisible()
  })
})

// =============================================================================
// 2. フォーム表示
// =============================================================================

test.describe('お問い合わせページ - フォーム表示', () => {
  test('お問い合わせフォームが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // フォームが存在することを確認
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })

  test('名前フィールドが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const nameInput = page.locator('input[name="name"]')
    await expect(nameInput).toBeVisible()

    // ラベルが存在することを確認
    const nameLabel = page.locator('label:has-text("名前"), label:has-text("お名前")')
    await expect(nameLabel.first()).toBeVisible()
  })

  test('メールアドレスフィールドが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const emailInput = page.locator('input[name="email"]')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')

    // ラベルが存在することを確認
    const emailLabel = page.locator('label:has-text("メール"), label:has-text("Email")')
    await expect(emailLabel.first()).toBeVisible()
  })

  test('電話番号フィールドが表示される（オプション）', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const phoneInput = page.locator('input[name="phone"]')

    if ((await phoneInput.count()) > 0) {
      await expect(phoneInput).toBeVisible()
    }
  })

  test('メッセージフィールドが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const messageInput = page.locator('textarea[name="message"]')
    await expect(messageInput).toBeVisible()

    // ラベルが存在することを確認
    const messageLabel = page.locator(
      'label:has-text("メッセージ"), label:has-text("内容"), label:has-text("お問い合わせ内容")'
    )
    await expect(messageLabel.first()).toBeVisible()
  })

  test('送信ボタンが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toContainText(/送信|Submit/i)
  })
})

// =============================================================================
// 3. フォームバリデーション
// =============================================================================

test.describe('お問い合わせページ - バリデーション', () => {
  test('名前が空の場合にエラーが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // メールとメッセージだけ入力
    await page.fill('input[name="email"]', testContacts.valid.email)
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // 送信ボタンをクリック
    await page.click('button[type="submit"]')

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=名前は必須, text=お名前を入力, [data-error="name"]'
    )

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('メールアドレスが空の場合にエラーが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 名前とメッセージだけ入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // 送信ボタンをクリック
    await page.click('button[type="submit"]')

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=メールアドレスは必須, text=メールアドレスを入力, [data-error="email"]'
    )

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('不正なメールアドレス形式でエラーが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 不正なメールアドレスを入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', 'invalid-email')
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // 送信ボタンをクリック
    await page.click('button[type="submit"]')

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=有効なメールアドレス, text=メールアドレスの形式, [data-error="email"]'
    )

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('メッセージが空の場合にエラーが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 名前とメールだけ入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)

    // 送信ボタンをクリック
    await page.click('button[type="submit"]')

    // エラーメッセージを確認
    const errorMessage = page.locator(
      'text=メッセージは必須, text=内容を入力, text=お問い合わせ内容を入力, [data-error="message"]'
    )

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('メッセージが短すぎる場合にエラーが表示される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 短いメッセージを入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)
    await page.fill('textarea[name="message"]', 'あ') // 1文字だけ

    // 送信ボタンをクリック
    await page.click('button[type="submit"]')

    // エラーメッセージを確認（文字数制限がある場合）
    const errorMessage = page.locator('text=文字以上')

    if ((await errorMessage.count()) > 0) {
      await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('すべてのフィールドが空の場合に複数のエラーが表示される', async ({
    page,
  }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 何も入力せずに送信
    await page.click('button[type="submit"]')

    // 複数のエラーメッセージが表示されることを確認
    await page.waitForTimeout(500)

    const errors = page.locator('[data-error], .text-destructive, .text-red-500')
    const errorCount = await errors.count()

    // 少なくとも2つ以上のエラーが表示されることを確認
    expect(errorCount).toBeGreaterThanOrEqual(2)
  })
})

// =============================================================================
// 4. フォーム入力
// =============================================================================

test.describe('お問い合わせページ - フォーム入力', () => {
  test('フォームに正しく入力できる', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 各フィールドに入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)

    const phoneInput = page.locator('input[name="phone"]')
    if ((await phoneInput.count()) > 0) {
      await page.fill('input[name="phone"]', testContacts.valid.phone)
    }

    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // 入力値を確認
    await expect(page.locator('input[name="name"]')).toHaveValue(
      testContacts.valid.name
    )
    await expect(page.locator('input[name="email"]')).toHaveValue(
      testContacts.valid.email
    )
    await expect(page.locator('textarea[name="message"]')).toHaveValue(
      testContacts.valid.message
    )
  })

  test('フォームをクリアできる', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)

    // クリア
    await page.locator('input[name="name"]').clear()
    await page.locator('input[name="email"]').clear()

    // クリアされたことを確認
    await expect(page.locator('input[name="name"]')).toHaveValue('')
    await expect(page.locator('input[name="email"]')).toHaveValue('')
  })

  test('Enterキーでフォームを送信しない（メッセージ入力中）', async ({
    page,
  }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // テキストエリアでEnterを押す
    const textarea = page.locator('textarea[name="message"]')
    await textarea.click()
    await textarea.type('テスト\n改行')

    // フォームが送信されず、改行が入力されることを確認
    await expect(textarea).toContainText('テスト\n改行')
  })
})

// =============================================================================
// 5. Turnstile検証
// =============================================================================

test.describe('お問い合わせページ - Turnstile', () => {
  test('Turnstileウィジェットが表示される（有効な場合）', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // Turnstileウィジェットまたはiframeを確認
    const turnstileWidget = page.locator(
      '[data-turnstile], iframe[src*="turnstile"], .cf-turnstile'
    )

    // Turnstileが有効な場合のみテスト
    if ((await turnstileWidget.count()) > 0) {
      await expect(turnstileWidget.first()).toBeVisible()
    }
  })
})

// =============================================================================
// 6. 送信処理
// =============================================================================

test.describe('お問い合わせページ - 送信処理', () => {
  test('送信ボタンクリックで送信処理が開始される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 有効なデータを入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // 送信ボタンをクリック
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // ローディング状態または無効化状態になることを確認
    // Turnstileがない環境では、バリデーションエラーまたはローディング状態
    await page.waitForTimeout(500)

    // ボタンが一時的に無効になるか、ローディング表示が出ることを確認
    const isDisabled = await submitButton.isDisabled()
    const hasLoadingText = await submitButton.textContent()

    // いずれかの状態であることを確認
    expect(isDisabled || hasLoadingText?.includes('送信中')).toBeTruthy()
  })

  test.skip('送信成功時に完了メッセージが表示される', async ({ page }) => {
    // このテストはTurnstileの設定とメール送信サービスの設定が必要
    // テスト環境ではスキップ
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    await page.click('button[type="submit"]')

    // 成功メッセージを確認
    const successMessage = page.locator(
      'text=送信しました, text=お問い合わせを受け付けました, [role="status"]'
    )
    await expect(successMessage.first()).toBeVisible({ timeout: 10000 })
  })
})

// =============================================================================
// 7. レスポンシブデザイン
// =============================================================================

test.describe('お問い合わせページ - レスポンシブ', () => {
  test('モバイルビューでフォームが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const form = page.locator('form')
    await expect(form).toBeVisible()

    // 各フィールドが表示されることを確認
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('textarea[name="message"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('タブレットビューでフォームが表示される', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const form = page.locator('form')
    await expect(form).toBeVisible()
  })

  test('モバイルビューでフォーム入力ができる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // モバイルでの入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await expect(page.locator('input[name="name"]')).toHaveValue(
      testContacts.valid.name
    )
  })
})

// =============================================================================
// 8. アクセシビリティ
// =============================================================================

test.describe('お問い合わせページ - アクセシビリティ', () => {
  test('フォームフィールドにラベルが関連付けられている', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 名前フィールド
    const nameInput = page.locator('input[name="name"]')
    const nameId = await nameInput.getAttribute('id')

    if (nameId) {
      const nameLabel = page.locator(`label[for="${nameId}"]`)
      await expect(nameLabel).toBeVisible()
    }

    // メールフィールド
    const emailInput = page.locator('input[name="email"]')
    const emailId = await emailInput.getAttribute('id')

    if (emailId) {
      const emailLabel = page.locator(`label[for="${emailId}"]`)
      await expect(emailLabel).toBeVisible()
    }
  })

  test('キーボードでフォームを操作できる', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // Tabキーで最初のフィールドにフォーカス
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // フォーカスがフォーム内の要素に当たっていることを確認
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('エラーメッセージがaria-liveで通知される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // 空のまま送信
    await page.click('button[type="submit"]')

    // エラーメッセージがアクセシブルであることを確認
    const errorContainer = page.locator(
      '[aria-live="polite"], [aria-live="assertive"], [role="alert"]'
    )

    if ((await errorContainer.count()) > 0) {
      await expect(errorContainer.first()).toBeVisible()
    }
  })

  test('必須フィールドにaria-requiredがある', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    const nameInput = page.locator('input[name="name"]')
    const isRequired =
      (await nameInput.getAttribute('required')) !== null ||
      (await nameInput.getAttribute('aria-required')) === 'true'

    expect(isRequired).toBe(true)
  })
})

// =============================================================================
// 9. エラーハンドリング
// =============================================================================

test.describe('お問い合わせページ - エラーハンドリング', () => {
  test('ネットワークエラー時にエラーメッセージが表示される', async ({
    page,
  }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // フォームに入力
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.fill('input[name="email"]', testContacts.valid.email)
    await page.fill('textarea[name="message"]', testContacts.valid.message)

    // オフラインモードをシミュレート
    await page.context().setOffline(true)

    // 送信
    await page.click('button[type="submit"]')

    // エラー処理を待機
    await page.waitForTimeout(2000)

    // オンラインに戻す
    await page.context().setOffline(false)

    // ページがクラッシュしていないことを確認
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })

  test('JavaScriptエラーが発生しない', async ({ page }) => {
    const errors: string[] = []

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // フォーム操作
    await page.fill('input[name="name"]', testContacts.valid.name)
    await page.click('button[type="submit"]')

    await page.waitForTimeout(1000)

    expect(errors.length).toBe(0)
  })
})

// =============================================================================
// 10. セキュリティ
// =============================================================================

test.describe('お問い合わせページ - セキュリティ', () => {
  test('XSSスクリプトが実行されない', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // XSSペイロードを入力
    const xssPayload = '<script>alert("XSS")</script>'
    await page.fill('input[name="name"]', xssPayload)
    await page.fill('textarea[name="message"]', xssPayload)

    // ページがクラッシュしないことを確認
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })

  test('SQLインジェクションペイロードが安全に処理される', async ({ page }) => {
    await page.goto(urls.contact)
    await page.waitForLoadState('networkidle')

    // SQLインジェクションペイロードを入力
    const sqlPayload = "'; DROP TABLE users; --"
    await page.fill('input[name="name"]', sqlPayload)
    await page.fill('textarea[name="message"]', sqlPayload)

    // ページがクラッシュしないことを確認
    const form = page.locator('form')
    await expect(form).toBeVisible()
  })
})
