"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  adminPromoteWaitlistEntryCommand,
  expireWaitlistOfferCommand,
} from "@/shared/domain/events/waitlist-commands";
import { getEventWaitlistOfferPaymentContext } from "@/shared/domain/events/waitlist-queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  sendEventWaitlistOffered,
  sendEventWaitlistExpired,
} from "@/shared/lib/email/event-waitlist-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  AuditAction,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";
import type { MutationResult } from "@/shared/lib/mutation-result";

const eventRegistrationIdSchema = prismaCuidIdSchema("イベント参加申込");

// =============================================================================
// 手動繰り上げ当選 (WAITLISTED → WAITLISTED_OFFERED)
// =============================================================================

type PromoteWaitlistEntryData = {
  registrationId: string;
  email: string | null;
  offeredAt: Date;
  expiresAt: Date;
  actorUserId: string;
  /** true = 対象は呼び出し前から既に WAITLISTED_OFFERED だった（冪等 no-op） */
  alreadyOffered: boolean;
};

/**
 * 管理画面から特定の WAITLISTED 申込を手動で繰り上げ当選にする。
 *
 * `adminCancelRegistration`（event-registration.ts）と同型: 入力を action 側で
 * safeParse → `executeAdminMutationResult` に resourceId として渡す（resourceId は
 * 事前に確定しているため `resolveAuditResourceId` は不要）。
 *
 * `executeAdminMutationResult` 自身が `logAction(user.id, "update", "event", resourceId)`
 * で粗粒度の監査ログを自動記録するのに加え、`afterSuccess` で
 * `registration-cancellation-side-effects.ts` と同じ convention
 * （resource: "event-registration"）の詳細ログ（旧値/新値/actor 付き）を残す。
 */
export async function adminPromoteWaitlistEntryAction(
  registrationId: string,
): Promise<MutationResult<PromoteWaitlistEntryData>> {
  const validated = eventRegistrationIdSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      const { promoted, alreadyOffered } =
        await adminPromoteWaitlistEntryCommand({
          registrationId: validated.data,
          now: new Date(),
        });
      return {
        registrationId: promoted.id,
        email: promoted.email,
        offeredAt: promoted.offeredAt,
        expiresAt: promoted.expiresAt,
        actorUserId: user.id,
        alreadyOffered,
      };
    },
    afterSuccess: (data) => {
      // WAITLISTED → WAITLISTED_OFFERED は CONFIRMED 件数を変えないため、公開側の
      // 残席表示 (`buildPublicEventSlotOptions` は confirmedCount のみで判定) には
      // 影響しない。`toggleEventRegistrationCheckIn` と同じ理由でキャッシュ無効化は
      // 不要（public-slot-options.ts / event-registration.ts 参照）。

      if (data.alreadyOffered) {
        // 冪等 no-op: 既に他の操作者が昇格させていたため、新規の状態遷移は発生して
        // いない。重複した監査ログ・重複したオファーメール送信を避けるためここで抜ける。
        return;
      }

      fireAndForget(
        createAuditLogRecord({
          userId: data.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: data.registrationId,
          newValue: { status: RegistrationStatus.WAITLISTED_OFFERED },
          metadata: {
            registrationId: data.registrationId,
            previousStatus: RegistrationStatus.WAITLISTED,
            newStatus: RegistrationStatus.WAITLISTED_OFFERED,
            actorUserId: data.actorUserId,
          },
        }),
        {
          operation: "auditLogAdminPromoteWaitlistEntry",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: { registrationId: data.registrationId },
        },
      );

      if (!data.email) {
        // waitlist 登録は公開フォーム側で email 必須のため実運用では発生しない想定
        // (DB 列自体は walk-in 登録と共有のため nullable)。発生時は非致命的に
        // ログのみ残し、既に成功している状態遷移自体はロールバックしない。
        logError(
          new Error(
            `Waitlist offer promoted without email: registration ${data.registrationId}`,
          ),
          {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "adminPromoteWaitlistEntryAction",
              registrationId: data.registrationId,
            },
          },
        );
        return;
      }
      const email = data.email;

      fireAndForget(
        (async () => {
          const paymentContext = await getEventWaitlistOfferPaymentContext(
            data.registrationId,
          );
          if (!paymentContext) return;
          await sendEventWaitlistOffered({
            registrationId: data.registrationId,
            to: email,
            expiresAt: data.expiresAt,
            paymentContext,
          });
        })(),
        {
          operation: "sendEventWaitlistOffered",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { registrationId: data.registrationId },
        },
      );
    },
  });
}

// =============================================================================
// 手動期限切れ (WAITLISTED_OFFERED → EXPIRED)
// =============================================================================

type ExpireWaitlistOfferData = {
  registrationId: string;
  email: string | null;
  actorUserId: string;
  /** true = この呼び出しで実際に EXPIRED 化した。false = 冪等 no-op（対象が既に OFFERED でなかった） */
  expired: boolean;
};

/**
 * 管理画面から特定の WAITLISTED_OFFERED 申込を手動で期限切れにする。
 *
 * ドメインロジックは Task 4 の `expireWaitlistOfferCommand`（冪等・独立 tx）にそのまま
 * 委譲する。`adminPromoteWaitlistEntryAction` と同じ auth/audit shape。
 */
export async function adminExpireWaitlistOfferAction(
  registrationId: string,
): Promise<MutationResult<ExpireWaitlistOfferData>> {
  const validated = eventRegistrationIdSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      const { registration } = await expireWaitlistOfferCommand({
        registrationId: validated.data,
        now: new Date(),
      });
      return {
        registrationId: validated.data,
        email: registration?.email ?? null,
        actorUserId: user.id,
        expired: registration !== null,
      };
    },
    afterSuccess: (data) => {
      // EXPIRED も CONFIRMED 件数を変えないためキャッシュ無効化は不要
      // (adminPromoteWaitlistEntryAction と同じ理由)。

      if (!data.expired) {
        // 冪等 no-op: 対象は呼び出し時点で既に WAITLISTED_OFFERED ではなかった
        // （既に期限切れ / 他の操作者が先に処理済み等）。何も変化していないため
        // 監査ログ・通知メールは残さない。
        return;
      }

      fireAndForget(
        createAuditLogRecord({
          userId: data.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: data.registrationId,
          newValue: { status: RegistrationStatus.EXPIRED },
          metadata: {
            registrationId: data.registrationId,
            previousStatus: RegistrationStatus.WAITLISTED_OFFERED,
            newStatus: RegistrationStatus.EXPIRED,
            actorUserId: data.actorUserId,
          },
        }),
        {
          operation: "auditLogAdminExpireWaitlistOffer",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: { registrationId: data.registrationId },
        },
      );

      if (!data.email) {
        logError(
          new Error(
            `Waitlist offer expired without email: registration ${data.registrationId}`,
          ),
          {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "adminExpireWaitlistOfferAction",
              registrationId: data.registrationId,
            },
          },
        );
        return;
      }
      const email = data.email;

      fireAndForget(
        sendEventWaitlistExpired({
          registrationId: data.registrationId,
          to: email,
        }),
        {
          operation: "sendEventWaitlistExpired",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { registrationId: data.registrationId },
        },
      );
    },
  });
}
