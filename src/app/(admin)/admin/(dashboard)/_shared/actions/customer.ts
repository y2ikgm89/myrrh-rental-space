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
  recomputeCustomerStatsCommand,
  resetCustomerEmailDeliveryStatusCommand,
  toggleCustomerActive as toggleCustomerActiveCommand,
  updateCustomer as updateCustomerCommand,
  updateCustomerNotes as updateCustomerNotesCommand,
  updateCustomerStatus as updateCustomerStatusCommand,
} from "@/shared/domain/customers/commands";
import type { AnonymizeCustomerReason } from "@/shared/domain/customers/commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { searchCustomers } from "@/shared/domain/customers/queries";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";
import { clearRiskFlagCommand } from "@/shared/domain/customers/risk-detection";
import { findDuplicateCandidateFor } from "@/shared/domain/customers/duplicate-detection";
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
      execute: async (user) => {
        const created = await createCustomerCommand(data);
        const { ip, userAgent } = await buildAuditRequestContext();
        return { created, actorUserId: user.id, ip, userAgent };
      },
      afterSuccess: (outcome) => {
        updateTag(CACHE_TAGS.CUSTOMERS);

        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: AuditAction.CREATE,
            resource: "customer.profile",
            resourceId: outcome.created.id,
            newValue: {
              lastName: data.lastName,
              firstName: data.firstName,
              lastNameKana: data.lastNameKana || null,
              firstNameKana: data.firstNameKana || null,
              companyName: data.companyName || null,
              customerType: data.customerType,
              email: data.email,
              phoneNumber: data.phoneNumber || null,
              postalCode: data.postalCode || null,
              prefecture: data.prefecture || null,
              city: data.city || null,
              streetAddress: data.streetAddress || null,
              building: data.building || null,
              notes: data.notes || null,
              marketingOptIn: data.marketingOptIn,
              phoneContactOptIn: data.phoneContactOptIn,
            },
            metadata: {
              ...(outcome.ip !== null && { ip: outcome.ip }),
              ...(outcome.userAgent !== null && {
                userAgent: outcome.userAgent,
              }),
            },
          }),
          {
            operation: "auditLogCreateCustomerProfile",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
          },
        );
      },
      resolveAuditResourceId: (outcome) => outcome.created.id,
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
      execute: async (user) => {
        const { previous } = await updateCustomerCommand(idValid.data, data);
        const { ip, userAgent } = await buildAuditRequestContext();
        return { previous, actorUserId: user.id, ip, userAgent };
      },
      afterSuccess: (outcome) => {
        updateTag(CACHE_TAGS.CUSTOMERS);
        updateTag(getCacheTag.customers.detail(idValid.data));

        // 顧客プロフィールの改ざん（予約通知メールの横取り等）を追跡できるよう、
        // executeAdminMutationResult の自動ログとは別に customer.profile として
        // 変更前後を明示的に記録する。
        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: AuditAction.UPDATE,
            resource: "customer.profile",
            resourceId: idValid.data,
            oldValue: outcome.previous,
            newValue: {
              lastName: data.lastName,
              firstName: data.firstName,
              lastNameKana: data.lastNameKana || null,
              firstNameKana: data.firstNameKana || null,
              companyName: data.companyName || null,
              customerType: data.customerType,
              email: data.email,
              phoneNumber: data.phoneNumber || null,
              postalCode: data.postalCode || null,
              prefecture: data.prefecture || null,
              city: data.city || null,
              streetAddress: data.streetAddress || null,
              building: data.building || null,
              notes: data.notes || null,
              marketingOptIn: data.marketingOptIn,
              phoneContactOptIn: data.phoneContactOptIn,
            },
            metadata: {
              ...(outcome.ip !== null && { ip: outcome.ip }),
              ...(outcome.userAgent !== null && {
                userAgent: outcome.userAgent,
              }),
            },
          }),
          {
            operation: "auditLogUpdateCustomerProfile",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
          },
        );
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * 顧客ステータス変更（ACTIVE/INACTIVE/BLACKLIST 等）は予約可否に直結するため、
 * executeAdminMutationResult の自動ログ（resource/action のみ）とは別に、
 * `customer.status` として before/after を明示的に記録する。
 */
export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<
  MutationResult<{
    previousStatus: CustomerStatus;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
  const parsed = updateCustomerStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async (user) => {
      const { previousStatus } = await updateCustomerStatusCommand(
        parsed.data.id,
        parsed.data.status,
      );
      const { ip, userAgent } = await buildAuditRequestContext();
      return { previousStatus, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));

      if (outcome.previousStatus === parsed.data.status) {
        // 冪等 no-op: ステータスが実際には変化していない (audit noise を減らす)
        return;
      }

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.status",
          resourceId: parsed.data.id,
          oldValue: { status: outcome.previousStatus },
          newValue: { status: parsed.data.status },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogUpdateCustomerStatus",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<
  MutationResult<{
    previousNotes: string | null;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
  const parsed = updateCustomerNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async (user) => {
      const { previousNotes } = await updateCustomerNotesCommand(
        parsed.data.id,
        parsed.data.notes,
      );
      const { ip, userAgent } = await buildAuditRequestContext();
      return { previousNotes, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));

      if (outcome.previousNotes === parsed.data.notes) {
        // 冪等 no-op: メモが実際には変化していない (audit noise を減らす)
        return;
      }

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.notes",
          resourceId: parsed.data.id,
          oldValue: { notes: outcome.previousNotes },
          newValue: { notes: parsed.data.notes },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogUpdateCustomerNotes",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

export async function toggleCustomerActive(id: string): Promise<
  MutationResult<{
    previousActive: boolean;
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
      const { previousActive } = await toggleCustomerActiveCommand(
        validated.data,
      );
      const { ip, userAgent } = await buildAuditRequestContext();
      return { previousActive, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.active",
          resourceId: validated.data,
          oldValue: { isActive: outcome.previousActive },
          newValue: { isActive: !outcome.previousActive },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogToggleCustomerActive",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

/**
 * 顧客の予約統計を手動で再計算する。
 * 統計情報の異常時や定期メンテナンス時に管理者が実行する。
 */
export async function recomputeCustomerStatsAction(
  customerId: string,
): Promise<MutationResult<{ actorUserId: string }>> {
  const validated = idSchema.safeParse(customerId);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      await recomputeCustomerStatsCommand(validated.data);
      return { actorUserId: user.id };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.stats",
          resourceId: validated.data,
          metadata: { trigger: "manual_recompute" },
        }),
        {
          operation: "auditLogRecomputeCustomerStats",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

/**
 * customer-risk-scan cron が付与した要注意フラグを管理者が手動で解除する
 * (誤検知時)。自動BLACKLIST化等は行わないため、フラグ解除自体は
 * ステータス変更を伴わない単純なクリア操作。
 */
export async function clearCustomerRiskFlag(id: string): Promise<
  MutationResult<{
    previousFlaggedForReviewAt: Date | null;
    previousFlagReasons: string[];
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
      const { previousFlaggedForReviewAt, previousFlagReasons } =
        await clearRiskFlagCommand(validated.data);
      const { ip, userAgent } = await buildAuditRequestContext();
      return {
        previousFlaggedForReviewAt,
        previousFlagReasons,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.riskFlag",
          resourceId: validated.data,
          oldValue: {
            flaggedForReviewAt:
              outcome.previousFlaggedForReviewAt?.toISOString() ?? null,
            flagReasons: outcome.previousFlagReasons,
          },
          newValue: { flaggedForReviewAt: null, flagReasons: [] },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogClearCustomerRiskFlag",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
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

// 匿名化で null 化される PII フィールド名（anonymizeCustomerCommand と同期）。
// 「何が消えたか」の forensic 記録に値そのものは含めない — 匿名化イベントの
// AuditLog に生 PII を永続保存すると、削除自体の趣旨（データ最小化）と衝突するため。
export const ANONYMIZED_CUSTOMER_FIELDS = [
  "email",
  "emailCanonical",
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "phoneNumber",
  "companyName",
  "postalCode",
  "prefecture",
  "city",
  "streetAddress",
  "building",
  "notes",
  "isActive",
  "marketingOptIn",
  "phoneContactOptIn",
  "userId",
] as const;

export async function anonymizeCustomer(
  id: string,
  reason: AnonymizeCustomerReason,
): Promise<
  MutationResult<{
    anonymized: Awaited<ReturnType<typeof anonymizeCustomerCommand>>;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
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
    execute: async (user) => {
      const anonymized = await anonymizeCustomerCommand({
        customerId: validatedId.data,
        reason: validatedReason.data,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return { anonymized, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validatedId.data));
      // RESEND-AUDIT M7: anonymize は suppression 状態を持つ Customer に対しては
      // `suppressedEmailHash` を書き込むため getSuppressedEmailSet() の結果集合が
      // 変化する。SUPPRESSED_EMAILS タグも invalidate する
      // (Resend webhook 経路 → invalidateSiteWideCacheFromRouteHandler と同型)。
      updateTag(CACHE_TAGS.SUPPRESSED_EMAILS);

      // STATE-03: これまで anonymizeCustomerCommand の戻り値（reason/hadUserId/
      // preservedSuppression 等）は破棄され、executeAdminMutationResult の自動ログ
      // （resource/action/resourceId のみ）しか残らなかった。生 PII は載せず、
      // 「何が匿名化されたか」を customer.anonymization として明示的に記録する。
      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.anonymization",
          resourceId: validatedId.data,
          newValue: {
            reason: outcome.anonymized.reason,
            anonymizedAt: outcome.anonymized.anonymizedAt.toISOString(),
            hadUserId: outcome.anonymized.hadUserId,
            preservedSuppression: outcome.anonymized.preservedSuppression,
            anonymizedFields: ANONYMIZED_CUSTOMER_FIELDS,
          },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogAnonymizeCustomer",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
        },
      );
    },
  });
}

export async function mergeCustomers(
  sourceId: string,
  targetId: string,
): Promise<
  MutationResult<{
    transferredReservations: number;
    transferredSeries: number;
    transferredInquiries: number;
    transferredReviews: number;
    transferredRegistrations: number;
    preservedSuppression: boolean;
    targetId: string;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
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
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const merged = await mergeCustomerCommand(
        sourceValid.data,
        targetValid.data,
      );
      return {
        ...merged,
        targetId: targetValid.data,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(sourceValid.data));
      updateTag(getCacheTag.customers.detail(targetValid.data));
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(CACHE_TAGS.REVIEWS);
      // RESEND-AUDIT M7: merge も source 側 suppression 状態を target に
      // 持ち越す可能性があるため SUPPRESSED_EMAILS を invalidate。
      // 持ち越しが発生しないケースでも即時 no-op で害はない。
      updateTag(CACHE_TAGS.SUPPRESSED_EMAILS);
      // EVENTS は CDN `event-v1` にマップされているため helper 経由で CDN purge も発火。
      invalidateSiteWideCache(CACHE_TAGS.EVENTS);

      // executeAdminMutationResult の集約 AuditLog は resource=customer /
      // resourceId=sourceId のみを残すため、target 側の id と移管件数が
      // forensic クエリから復元不能だった。ここで customer.merge リソースに
      // per-merge の diff record を残す (single-op anonymizeCustomer と同型)。
      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.merge",
          resourceId: sourceValid.data,
          newValue: {
            targetId: outcome.targetId,
            transferredReservations: outcome.transferredReservations,
            transferredInquiries: outcome.transferredInquiries,
            transferredReviews: outcome.transferredReviews,
            transferredRegistrations: outcome.transferredRegistrations,
            preservedSuppression: outcome.preservedSuppression,
          },
          metadata: {
            channel: "admin",
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogMergeCustomers",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
        },
      );
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

  const results = await searchCustomers(query);

  fireAndForget(
    createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.READ,
      resource: "customer",
      metadata: { query, resultCount: results.length },
    }),
    {
      operation: "auditLogSearchCustomers",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    },
  );

  return results;
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

/**
 * Phase 4: 重複顧客検出cronが検知した候補を、マージダイアログの初期選択状態に
 * プリフィルするための薄い wrapper。customer:read 権限で動く read-only action。
 * 一致する相手が無い場合は null を返す。
 */
export async function findDuplicateCandidateForCustomer(
  customerId: string,
): Promise<
  MutationResult<{
    candidate: CustomerSearchResult | null;
  }>
> {
  const validated = idSchema.safeParse(customerId);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "read",
    resourceId: validated.data,
    execute: async () => {
      const candidate = await findDuplicateCandidateFor(validated.data);
      return { candidate };
    },
  });
}
