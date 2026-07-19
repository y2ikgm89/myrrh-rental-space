"use server";

/**
 * 顧客 Server Actions
 *
 * `useActionState` 統合経路 (`(prev, formData) => SubmissionResult`) に
 * clean break 移行。認証・権限・監査ログは `executeAdminMutationResult` SSoT
 * に委譲する。
 *
 * status / notes / soft-delete / merge 系は input ベースで残置 (form 不使用)。
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { checkPermission } from "@/admin/lib/action-auth";
// CACHE-INVALIDATE-04: mergeCustomers は公開側の EVENTS collection (CDN `event-v1`)
// にも波及するため helper 経由で CDN purge も併発する。CUSTOMERS/RESERVATIONS/
// INQUIRIES/REVIEWS は admin-only (private,no-store) なので raw updateTag のまま。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  customerFormSchema,
  updateCustomerNotesSchema,
  updateCustomerStatusSchema,
} from "@/shared/lib/validations/customer";
import {
  anonymizeCustomerCommand,
  createCustomer as createCustomerCommand,
  mergeCustomerCommand,
  resetCustomerEmailDeliveryStatusCommand,
  toggleCustomerActive as toggleCustomerActiveCommand,
  updateCustomer as updateCustomerCommand,
  updateCustomerNotes as updateCustomerNotesCommand,
  updateCustomerStatus as updateCustomerStatusCommand,
} from "@/shared/domain/customers/commands";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { searchCustomers } from "@/shared/domain/customers/queries";
import { clearRiskFlagCommand } from "@/shared/domain/customers/risk-detection";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import {
  AuditAction,
  CustomerStatus,
  EmailDeliveryStatus,
} from "@/shared/lib/validations/enums/prisma-types";

const idSchema = uuidIdSchema("顧客");

/**
 * 顧客新規作成 — conform `useActionState` 統合経路。
 *
 * 成功時は `submission.reply({ resetForm: true })` で `{ initialValue: null }`
 * を返し、client 側で `router.push("/admin/customers")` にリダイレクトする。
 */
export async function createCustomer(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, customerFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "customer",
      action: "create",
      execute: async () => createCustomerCommand(data),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.CUSTOMERS);
      },
      resolveAuditResourceId: (data) => data.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * 顧客更新 — conform `useActionState` 統合経路。
 *
 * `customerId` は `Function.prototype.bind` で部分適用する想定:
 *   `useActionState(updateCustomer.bind(null, customer.id), undefined)`
 */
export async function updateCustomer(
  customerId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, customerFormSchema, async (data) => {
    const idValid = idSchema.safeParse(customerId);
    if (!idValid.success) {
      return { ok: false, error: "顧客IDが不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "customer",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await updateCustomerCommand(idValid.data, data);
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.CUSTOMERS);
        updateTag(getCacheTag.customers.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<MutationResult> {
  const parsed = updateCustomerStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerStatusCommand(parsed.data.id, parsed.data.status);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<MutationResult> {
  const parsed = updateCustomerNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerNotesCommand(parsed.data.id, parsed.data.notes);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));
    },
  });
}

export async function toggleCustomerActive(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await toggleCustomerActiveCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));
    },
  });
}

/**
 * customer-risk-scan cron が付与した要注意フラグを管理者が手動で解除する
 * (誤検知時)。自動BLACKLIST化等は行わないため、フラグ解除自体は
 * ステータス変更を伴わない単純なクリア操作。
 */
export async function clearCustomerRiskFlag(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await clearRiskFlagCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));
    },
  });
}

/**
 * STATE-03: 顧客匿名化 Server Action。
 *
 * 決済歴 (Receipt 発行済) のある顧客は物理削除できない (Receipt.reservation
 * onDelete: Restrict) ため、旧 deleteCustomer 相当の操作は匿名化に置換された。
 *
 * `resource: "customer", action: "delete"` の RBAC は維持 (「顧客レコードから
 * PII を消す」= 破壊的操作扱い、EDITOR ロール以下では実行不可)。
 */
const anonymizeReasonSchema = z.enum(
  ["customer-requested", "admin-purge", "data-retention"] as const,
  { error: "匿名化理由が不正です" },
);

export async function anonymizeCustomer(
  id: string,
  reason: AnonymizeCustomerReason,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }
  const validatedReason = anonymizeReasonSchema.safeParse(reason);
  if (!validatedReason.success) {
    return createValidationMutationError(validatedReason.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    resourceId: validatedId.data,
    execute: async () => {
      await anonymizeCustomerCommand({
        customerId: validatedId.data,
        reason: validatedReason.data,
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validatedId.data));
    },
  });
}

export async function mergeCustomers(
  sourceId: string,
  targetId: string,
): Promise<
  MutationResult<{
    transferredReservations: number;
    transferredInquiries: number;
    transferredReviews: number;
    transferredRegistrations: number;
  }>
> {
  const sourceValid = z.uuid().safeParse(sourceId);
  const targetValid = z.uuid().safeParse(targetId);
  if (!sourceValid.success || !targetValid.success) {
    return { error: "無効な顧客IDです" };
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    resourceId: sourceValid.data,
    execute: async () =>
      mergeCustomerCommand(sourceValid.data, targetValid.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(sourceValid.data));
      updateTag(getCacheTag.customers.detail(targetValid.data));
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(CACHE_TAGS.REVIEWS);
      // EVENTS は CDN `event-v1` にマップされているため helper 経由で CDN purge も発火。
      invalidateSiteWideCache(CACHE_TAGS.EVENTS);
    },
  });
}

export async function searchCustomersAction(
  query: string,
): Promise<Awaited<ReturnType<typeof searchCustomers>>> {
  // 顧客 PII 検索は customer:read 権限必須。checkAdminAuth は認証のみで全ダッシュボード
  // ロール（customer:read を持たない EDITOR 含む）を通すため RBAC バイパスになる。
  const auth = await checkPermission("customer", "read");
  if (!auth.success) return [];
  return searchCustomers(query);
}

/**
 * RESEND-AUDIT M8: Customer.emailDeliveryStatus を OK にリセットする。
 *
 * Resend Webhook が `HARD_BOUNCED` / `COMPLAINED` を刻んだ顧客は、
 * `sendEmail()` の suppression 判定 (`getSuppressedEmailSet()`) により以降の
 * メールが silent に drop される。DNS 一時障害や誤配信で終端状態が付いた
 * 正規顧客を管理者が復旧させるための唯一のパス。
 *
 * - RBAC は customer:update (BLACKLIST 化などと同カテゴリの状態変更)。
 * - `previous` が既に OK の呼び出しは冪等 no-op として AuditLog を残さない。
 * - AuditLog は `resource: "customer.emailDeliveryStatus"` で actor + previous +
 *   ip / userAgent を含めて残す (event-waitlist と同型)。
 * - キャッシュ無効化: SUPPRESSED_EMAILS (send suppression の即時反映) +
 *   CUSTOMERS 一覧 + customers.detail。いずれも admin-only tag のため raw
 *   `updateTag`。
 */
export async function resetCustomerEmailDelivery(id: string): Promise<
  MutationResult<{
    customerId: string;
    previous: EmailDeliveryStatus;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      // UA-HORIZ-03: ip/userAgent は execute 内 = request scope で回収し
      // afterSuccess (fireAndForget 経由) に持ち越す。
      const { ip, userAgent } = await buildAuditRequestContext();
      const { previous } = await resetCustomerEmailDeliveryStatusCommand(
        validated.data,
      );
      return {
        customerId: validated.data,
        previous,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (data) => {
      if (data.previous === EmailDeliveryStatus.OK) {
        // 冪等 no-op: 既に OK。sendEmail の suppression set にも入っていないため
        // cache invalidation も AuditLog も不要 (audit noise を減らす)。
        return;
      }

      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(CACHE_TAGS.SUPPRESSED_EMAILS);
      updateTag(getCacheTag.customers.detail(data.customerId));

      fireAndForget(
        createAuditLogRecord({
          userId: data.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.emailDeliveryStatus",
          resourceId: data.customerId,
          oldValue: { emailDeliveryStatus: data.previous },
          newValue: { emailDeliveryStatus: EmailDeliveryStatus.OK },
          metadata: {
            customerId: data.customerId,
            previousStatus: data.previous,
            newStatus: EmailDeliveryStatus.OK,
            actorUserId: data.actorUserId,
            ...(data.ip !== null && { ip: data.ip }),
            ...(data.userAgent !== null && { userAgent: data.userAgent }),
          },
        }),
        {
          operation: "auditLogResetCustomerEmailDelivery",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: { customerId: data.customerId },
        },
      );
    },
  });
}
