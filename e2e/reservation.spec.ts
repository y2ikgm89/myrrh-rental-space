import { test, expect } from "@playwright/test";
import { testReservations, urls, reservationFactory } from "./fixtures";

/**
 * E2E Tests: Reservation Flow
 *
 * Tests the complete reservation flow from space selection to confirmation.
 * Covers validation, availability checking, and duplicate booking prevention.
 *
 * Prerequisites:
 * - Database should be seeded with test spaces (bun prisma/seed.ts --demo)
 * - Turnstile CAPTCHA should be configured or mocked in test environment
 */

test.describe("Reservation Flow", () => {
  // Test data
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const validStartTime = "10:00";
  const validEndTime = "12:00";

  test.beforeEach(async ({ page }) => {
    // Navigate to spaces page to get a space ID
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");
  });

  test("should load reservation page with space selection prompt when no spaceId", async ({
    page,
  }) => {
    // Navigate to reservation page without spaceId
    await page.goto(urls.reservation);
    await page.waitForLoadState("networkidle");

    // Should show prompt to select a space
    await expect(
      page.getByRole("heading", {
        name: /予約するスペースを選択してください/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /スペース一覧を見る/i }),
    ).toBeVisible();
  });

  test("should load reservation form when valid spaceId is provided", async ({
    page,
  }) => {
    // Get first available space from spaces page
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    const firstSpaceLink = spaceLinks.first();
    await expect(firstSpaceLink).toBeVisible();

    const href = await firstSpaceLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Extract space ID from URL (format: /spaces/{slug}?id={spaceId} or similar)
    // Navigate to the space detail page
    await firstSpaceLink.click();
    await page.waitForLoadState("networkidle");

    // Click reservation button
    const reserveButton = page.getByRole("link", { name: /予約する/i });
    await expect(reserveButton).toBeVisible();
    await reserveButton.click();
    await page.waitForLoadState("networkidle");

    // Should load reservation form
    await expect(page.getByRole("heading", { name: /予約/i })).toBeVisible();
    await expect(page.getByText(/日時選択/i)).toBeVisible();
  });

  test("should show calendar and time slot picker", async ({ page }) => {
    // Navigate to first space and start reservation
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    const reserveButton = page.getByRole("link", { name: /予約する/i });
    await reserveButton.click();
    await page.waitForLoadState("networkidle");

    // Calendar should be visible
    await expect(page.getByText(/日付を選択/i)).toBeVisible();

    // Time slot picker card should be visible
    await expect(page.getByText(/時間を選択/i)).toBeVisible();

    // Step indicator should show "日時選択" as active
    const stepIndicator = page.locator('[class*="stepIndicator"]').first();
    await expect(stepIndicator).toContainText("日時選択");
  });

  test("should allow selecting date and time slots", async ({ page }) => {
    // Navigate to reservation form
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select tomorrow's date (avoid past dates)
    const tomorrowDay = tomorrow.getDate();
    const dateButton = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first();
    await dateButton.click();

    // Wait for time slots to load
    await page.waitForTimeout(500);

    // Select start time
    const startTimeSlot = page
      .locator("button", { hasText: validStartTime })
      .first();
    await expect(startTimeSlot).toBeVisible();
    await startTimeSlot.click();

    // Select end time
    const endTimeSlot = page
      .locator("button", { hasText: validEndTime })
      .first();
    await expect(endTimeSlot).toBeVisible();
    await endTimeSlot.click();

    // Price should be displayed
    await expect(page.locator("text=/合計/i")).toBeVisible();
    await expect(page.locator("text=/¥/i").first()).toBeVisible();

    // "Next" button should be enabled
    const nextButton = page.getByRole("button", { name: /次へ進む/i });
    await expect(nextButton).toBeEnabled();
  });

  test("should validate required fields on customer info form", async ({
    page,
  }) => {
    // Navigate to customer info step
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();

    // Proceed to info step
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Try to submit without filling required fields
    const submitButton = page.getByRole("button", { name: /予約を確定する/i });
    await submitButton.click();

    // Validation errors should appear
    await expect(page.getByText(/姓を入力してください/i)).toBeVisible();
    await expect(page.getByText(/名を入力してください/i)).toBeVisible();
    await expect(
      page.getByText(/メールアドレスを入力してください/i),
    ).toBeVisible();
    await expect(page.getByText(/電話番号を入力してください/i)).toBeVisible();
  });

  test("should validate email format", async ({ page }) => {
    // Navigate to customer info step
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Fill form with invalid email
    await page
      .locator('input[name="lastName"]')
      .fill(testReservations.valid.customerName);
    await page.locator('input[name="firstName"]').fill("太郎");
    await page
      .locator('input[name="email"]')
      .fill(testReservations.invalid.customerEmail); // Invalid email
    await page
      .locator('input[name="phoneNumber"]')
      .fill(testReservations.valid.customerPhone);

    // Try to submit
    await page.getByRole("button", { name: /予約を確定する/i }).click();

    // Email validation error should appear
    await expect(
      page.getByText(/有効なメールアドレスを入力してください/i),
    ).toBeVisible();
  });

  test("should validate phone number format", async ({ page }) => {
    // Navigate to customer info step
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Fill form with invalid phone
    await page
      .locator('input[name="lastName"]')
      .fill(testReservations.valid.customerName);
    await page.locator('input[name="firstName"]').fill("太郎");
    await page
      .locator('input[name="email"]')
      .fill(testReservations.valid.customerEmail);
    await page
      .locator('input[name="phoneNumber"]')
      .fill(testReservations.invalid.customerPhone); // Invalid phone

    // Try to submit
    await page.getByRole("button", { name: /予約を確定する/i }).click();

    // Phone validation error should appear
    await expect(
      page.getByText(/電話番号は数字とハイフンのみで入力してください/i),
    ).toBeVisible();
  });

  test("should reject past dates", async ({ page }) => {
    // Navigate to reservation form
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Try to select yesterday (past date buttons should be disabled)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = yesterday.getDate();

    const pastDateButton = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${yesterdayDay}$`) })
      .first();

    // Past dates should be disabled or marked unavailable
    const isDisabled = await pastDateButton.isDisabled().catch(() => false);
    const hasDisabledClass = await pastDateButton
      .getAttribute("class")
      .then((cls) => cls?.includes("disabled") || cls?.includes("unavailable"))
      .catch(() => false);

    expect(isDisabled || hasDisabledClass).toBeTruthy();
  });

  test("should complete valid reservation and show success message", async ({
    page,
    context,
  }) => {
    // Set up Turnstile bypass for testing (if configured)
    // In production tests, you'd mock or use a test token
    await context.route("**/*turnstile*", (route) =>
      route.fulfill({ status: 200, body: "{}" }),
    );

    // Navigate to reservation form
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Step 1: Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Step 2: Fill customer info (factory で並列セーフな unique data 生成)
    const reservation = reservationFactory.build({
      customerLastName: "テスト",
      customerFirstName: "太郎",
      notes: "E2Eテスト予約",
    });
    await page
      .locator('input[name="lastName"]')
      .fill(reservation.customerLastName);
    await page
      .locator('input[name="firstName"]')
      .fill(reservation.customerFirstName);
    await page.locator('input[name="email"]').fill(reservation.customerEmail);
    await page
      .locator('input[name="phoneNumber"]')
      .fill(reservation.customerPhone);
    await page.locator('textarea[name="notes"]').fill(reservation.notes);

    // Accept terms if checkbox is present
    const termsCheckbox = page.locator('input[type="checkbox"]#agreedToTerms');
    const termsCheckboxExists = await termsCheckbox.count();
    if (termsCheckboxExists > 0) {
      await termsCheckbox.check();
    }

    // Submit reservation
    const submitButton = page.getByRole("button", { name: /予約を確定する/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Wait for submission to complete
    await page.waitForLoadState("networkidle");

    // Success message should appear
    await expect(page.getByText(/予約を受け付けました/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText(/確認メールをお送りしましたので、ご確認ください/i),
    ).toBeVisible();

    // Success icon should be visible
    await expect(page.locator("svg").filter({ hasText: "" })).toBeVisible();
  });

  test("should prevent duplicate booking for the same time slot", async ({
    page,
    context,
    browser,
  }) => {
    // Set up Turnstile bypass
    await context.route("**/*turnstile*", (route) =>
      route.fulfill({ status: 200, body: "{}" }),
    );

    // Create first reservation
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    const spaceUrl = page.url();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Fill and submit first reservation (factory で unique email 生成)
    const firstReservation = reservationFactory.build({
      customerLastName: "一人目",
      customerFirstName: "太郎",
    });
    await page
      .locator('input[name="lastName"]')
      .fill(firstReservation.customerLastName);
    await page
      .locator('input[name="firstName"]')
      .fill(firstReservation.customerFirstName);
    await page
      .locator('input[name="email"]')
      .fill(firstReservation.customerEmail);
    await page
      .locator('input[name="phoneNumber"]')
      .fill(firstReservation.customerPhone);

    const termsCheckbox = page.locator('input[type="checkbox"]#agreedToTerms');
    const termsCheckboxExists = await termsCheckbox.count();
    if (termsCheckboxExists > 0) {
      await termsCheckbox.check();
    }

    await page.getByRole("button", { name: /予約を確定する/i }).click();
    await page.waitForLoadState("networkidle");

    // Wait for success
    await expect(page.getByText(/予約を受け付けました/i)).toBeVisible({
      timeout: 10000,
    });

    // Try to create duplicate reservation in new context
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();

    await newContext.route("**/*turnstile*", (route) =>
      route.fulfill({ status: 200, body: "{}" }),
    );

    await newPage.goto(spaceUrl);
    await newPage.waitForLoadState("networkidle");

    await newPage.getByRole("link", { name: /予約する/i }).click();
    await newPage.waitForLoadState("networkidle");

    // Select SAME date and time
    await newPage
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await newPage.waitForTimeout(500);

    // Time slot should be unavailable or show as booked
    const bookedStartTime = newPage
      .locator("button", { hasText: validStartTime })
      .first();
    const isDisabled = await bookedStartTime.isDisabled().catch(() => false);
    const hasDisabledClass = await bookedStartTime
      .getAttribute("class")
      .then((cls) => cls?.includes("disabled") || cls?.includes("unavailable"))
      .catch(() => false);

    // If time slot can still be selected (edge case), submission should fail with overlap error
    if (!isDisabled && !hasDisabledClass) {
      await bookedStartTime.click();
      await newPage
        .locator("button", { hasText: validEndTime })
        .first()
        .click();
      await newPage.getByRole("button", { name: /次へ進む/i }).click();
      await newPage.waitForLoadState("networkidle");

      const secondReservation = reservationFactory.build({
        customerLastName: "二人目",
        customerFirstName: "次郎",
      });
      await newPage
        .locator('input[name="lastName"]')
        .fill(secondReservation.customerLastName);
      await newPage
        .locator('input[name="firstName"]')
        .fill(secondReservation.customerFirstName);
      await newPage
        .locator('input[name="email"]')
        .fill(secondReservation.customerEmail);
      await newPage
        .locator('input[name="phoneNumber"]')
        .fill(secondReservation.customerPhone);

      const newTermsCheckbox = newPage.locator(
        'input[type="checkbox"]#agreedToTerms',
      );
      const newTermsExists = await newTermsCheckbox.count();
      if (newTermsExists > 0) {
        await newTermsCheckbox.check();
      }

      await newPage.getByRole("button", { name: /予約を確定する/i }).click();
      await newPage.waitForLoadState("networkidle");

      // Error message should appear
      await expect(
        newPage.getByText(/選択された時間帯は既に予約されています/i),
      ).toBeVisible({ timeout: 10000 });
    } else {
      // Time slot properly disabled - test passes
      expect(isDisabled || hasDisabledClass).toBeTruthy();
    }

    await newContext.close();
  });

  test("should allow going back to date/time selection from customer info", async ({
    page,
  }) => {
    // Navigate to customer info step
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Click back button
    const backButton = page.getByRole("button", { name: /戻る/i });
    await expect(backButton).toBeVisible();
    await backButton.click();
    await page.waitForLoadState("networkidle");

    // Should return to date/time selection
    await expect(page.getByText(/日付を選択/i)).toBeVisible();
    await expect(page.getByText(/時間を選択/i)).toBeVisible();
  });

  test("should display selected reservation details on customer info step", async ({
    page,
  }) => {
    // Navigate to customer info step
    await page.goto(urls.spaces);
    const spaceLinks = page.locator('a[href*="/spaces/"]');
    await spaceLinks.first().click();
    await page.waitForLoadState("networkidle");

    // Get space name
    const spaceName = await page.locator("h1").first().textContent();

    await page.getByRole("link", { name: /予約する/i }).click();
    await page.waitForLoadState("networkidle");

    // Select date and time
    const tomorrowDay = tomorrow.getDate();
    await page
      .locator("button")
      .filter({ hasText: new RegExp(`^${tomorrowDay}$`) })
      .first()
      .click();
    await page.waitForTimeout(500);

    await page.locator("button", { hasText: validStartTime }).first().click();
    await page.locator("button", { hasText: validEndTime }).first().click();
    await page.getByRole("button", { name: /次へ進む/i }).click();
    await page.waitForLoadState("networkidle");

    // Reservation summary should be visible
    await expect(page.getByText(/予約内容/i)).toBeVisible();
    await expect(page.locator(`text=${spaceName}`).first()).toBeVisible();
    await expect(page.getByText(new RegExp(validStartTime))).toBeVisible();
    await expect(page.getByText(new RegExp(validEndTime))).toBeVisible();
    await expect(page.locator("text=/¥/i").first()).toBeVisible();
  });
});
