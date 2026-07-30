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
 * Stripe secret / webhook secret は `getStripeCredentialCiphertext` 経由で
 * キャッシュせず読むため、fixture 投入後は即座に webhook 経路へ反映される。
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
    typeof parsed.webhookSecret !== "string"
  ) {
    throw new Error(
      `setup-stripe-webhook-fixture returned unexpected shape: ${trimmed}`,
    );
  }

  return { webhookSecret: (parsed as { webhookSecret: string }).webhookSecret };
}
