import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type StripeWebhookFixture = {
  webhookSecret: string;
};

/**
 * Playwright spec から `scripts/e2e/setup-stripe-webhook-fixture.ts` を実行し、
 * Settings singleton に E2E 用の Stripe secret / webhook secret を仕込む。
 *
 * webServer 起動後・最初の `/api/webhooks/stripe` 呼び出し前に呼ぶこと。
 * `getStripeSettings` は `"use cache"` (STATIC_SETTINGS = days) のため、
 * webhook 経路以外で先に populate されると本 fixture の値が反映されない
 * (dev DB 上に stripe secret が空の状態がキャッシュされる)。E2E の他 spec は
 * 現在 checkout 導線を踏まず `assertOnlinePaymentAvailable` を実行しないため、
 * この順序契約は自然に満たされる。
 */
export async function setupStripeWebhookFixture(): Promise<StripeWebhookFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "setup-stripe-webhook-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("setup-stripe-webhook-fixture produced no output");
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("webhookSecret" in parsed) ||
    typeof (parsed as { webhookSecret: unknown }).webhookSecret !== "string"
  ) {
    throw new Error(
      `setup-stripe-webhook-fixture returned unexpected shape: ${trimmed}`,
    );
  }

  return { webhookSecret: (parsed as { webhookSecret: string }).webhookSecret };
}
