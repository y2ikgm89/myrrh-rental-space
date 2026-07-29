import "server-only";

import { headers } from "next/headers";
import { sendEventRegistrationUpdated } from "@/shared/domain/email/lib-dispatch";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import type { EventRegistrationSelfServeUpdatePayload } from "@/shared/domain/events/registration-customer-update-commands";

export async function applyEventRegistrationSelfServeUpdateSideEffects(input: {
  registrationId: string;
  eventId: string;
  customerId: string | null;
  channel: "customer-token" | "customer-mypage";
  actorUserId?: string | null;
  tokenFingerprint?: string | null;
  payload: EventRegistrationSelfServeUpdatePayload;
  emailContext: {
    eventTitle: string;
    eventStartTime: Date;
    eventEndTime: Date;
    ticketName: string;
    ticketUnitPrice: number;
  };
  newValues: {
    name: string;
    email: string;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
}): Promise<void> {
  const requestHeaders = await headers();
  const ip = await getClientIpFromHeaders();
  const userAgent = requestHeaders.get("user-agent");

  fireAndForget(
    (async () => {
      const renderContext = await getEventEmailRenderContext();
      await sendEventRegistrationUpdated(
        {
          registrationId: input.registrationId,
          customerId: input.customerId,
          customerName: input.newValues.name,
          customerEmail: input.newValues.email,
          eventTitle: input.emailContext.eventTitle,
          eventStartTime: input.emailContext.eventStartTime,
          eventEndTime: input.emailContext.eventEndTime,
          ticketName: input.emailContext.ticketName,
          ticketUnitPrice: input.emailContext.ticketUnitPrice,
          quantity: input.newValues.quantity,
          updatedAt: input.payload.updatedAt,
        },
        renderContext,
      );
    })(),
    {
      operation: "sendEventRegistrationUpdatedEmail",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { registrationId: input.registrationId },
    },
  );

  fireAndForget(
    createNotificationCommand({
      type: NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE,
      title:
        NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE],
      message:
        input.channel === "customer-token"
          ? "ゲストイベント申込が変更されました"
          : `${input.newValues.name}様のイベント申込が変更されました`,
      resourceType: "event",
      resourceId: input.eventId,
    }),
    {
      operation: "createEventRegistrationUpdateNotification",
      category: ErrorCategory.DATABASE,
    },
  );

  fireAndForget(
    createAuditLogRecord({
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: input.registrationId,
      oldValue: input.payload.previous,
      newValue: input.newValues,
      metadata: {
        channel: input.channel,
        ip,
        userAgent,
        ...(input.tokenFingerprint
          ? { tokenFingerprint: input.tokenFingerprint }
          : {}),
      },
    }).catch((error: unknown) => {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "auditLogEventRegistrationUpdate",
          registrationId: input.registrationId,
        },
      });
    }),
    {
      operation: "auditLogEventRegistrationUpdate",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { registrationId: input.registrationId },
    },
  );
}
