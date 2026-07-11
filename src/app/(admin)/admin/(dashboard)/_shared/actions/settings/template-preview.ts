"use server";

/**
 * メールテンプレート プレビュー Server Action（read-only / 非 mutation）
 *
 * 公式 `@react-email/render` を Server Action 内で呼んで XHTML 文字列を生成し、
 * client 側で `<iframe srcDoc={html}>` に流し込む。**実メールは絶対に送信しない**:
 * 本ファイルから `@/shared/lib/email/*` への import を一切禁止することで構造的に分離。
 *
 * **`executeAdminMutationResult` を経由しない**理由:
 *  - preview は副作用ゼロの read 操作。mutation 用ラッパー（監査ログ強制）に通すと
 *    テンプレ切替 1 回ごとに `settings:update` の偽 audit が積まれ、本当の設定変更と
 *    混在してフォレンジック価値が落ちる。
 *  - 代わりに同等のセキュリティガード（認証 → RBAC `settings:read` → rate-limit）を
 *    手書きで通す。これにより VIEWER もプレビュー可能になる（read 権限のみで足りる）。
 *
 * `useRealFooter: true` 指定時のみ実 `getEmailFooterData()` を呼び、デモフッターを
 * 実値で上書きする（DB hit が入るため admin がチェックボックスで明示 opt-in）。
 *
 * @module admin/actions/settings/template-preview
 */

import { render } from "@react-email/render";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { getTemplate } from "@/shared/emails/_registry";
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@/shared/emails/_registry/data";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { getErrorMessage } from "@/shared/lib/errors/server";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  authMutationRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";

const keySchema = z.enum(TEMPLATE_KEYS, {
  error: "テンプレート種別が不正です",
});

export async function previewTemplateAction(
  key: TemplateKey,
  options?: { useRealFooter?: boolean },
): Promise<MutationResult<{ html: string }>> {
  const parsed = keySchema.safeParse(key);
  if (!parsed.success) {
    return createValidationMutationError(
      parsed.error,
      parsed.error.issues[0]?.message ?? "テンプレート種別が不正です",
    );
  }
  const validKey = parsed.data;

  // 1. 認証
  const authResult = await checkAdminAuth();
  if (!authResult.success) {
    return { error: authResult.error.error };
  }
  const { user } = authResult;

  // 2. RBAC: read 操作なので settings:read で gate（VIEWER でも閲覧可）
  if (!hasPermission(user.role, "settings", "read")) {
    return { error: "settings の閲覧権限がありません" };
  }

  // 3. rate-limit（test-send と同じ authMutationRateLimiter を再利用。
  // preview は連打されやすいが、admin trusted boundary 内の DoS なので
  // 同じバケット 20/15min/IP で十分）
  const ip = await getClientIpFromHeaders();
  const limit = await authMutationRateLimiter.check(ip);
  if (!limit.success) {
    return createMutationError(
      "リクエストが多すぎます。しばらくしてからお試しください",
    );
  }

  // 4. render
  try {
    const entry = getTemplate(validKey);
    const fixtureOverride = options?.useRealFooter
      ? { footer: await getEmailFooterData() }
      : undefined;
    const html = await render(entry.renderPreview(fixtureOverride), {
      pretty: false,
    });
    return { html };
  } catch (error) {
    return createMutationError(
      `プレビュー生成に失敗しました: ${getErrorMessage(error)}`,
    );
  }
}
