import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

export async function getEventRegistrationPaymentBannerContext(params: {
  readonly registrationId: string;
  readonly eventSlug: string;
}) {
  return prisma.eventRegistration.findFirst({
    where: {
      id: params.registrationId,
      event: { slug: params.eventSlug, deletedAt: null },
    },
    select: {
      paymentStatus: true,
      status: true,
    },
  });
}

export function resolveEventPaymentBannerMessage(params: {
  readonly payment: string | undefined;
  readonly registration:
    | {
        readonly paymentStatus: PaymentStatus;
        readonly status: RegistrationStatus;
      }
    | null
    | undefined;
}): {
  readonly variant: "success" | "warning" | "muted";
  readonly title: string;
  readonly description: string;
} | null {
  const { payment, registration } = params;
  if (!payment || !registration) return null;

  if (payment === "success") {
    if (registration.paymentStatus === PaymentStatus.PAID) {
      return {
        variant: "success",
        title: "お支払いが完了しました",
        description: "決済が正常に完了しました。確認メールをご確認ください。",
      };
    }
    if (registration.paymentStatus === PaymentStatus.PENDING) {
      return {
        variant: "warning",
        title: "決済処理中です",
        description:
          "決済の反映には数秒かかる場合があります。ページを更新してご確認ください。",
      };
    }
    return {
      variant: "muted",
      title: "決済結果を確認できませんでした",
      description:
        "決済状況を確認できませんでした。マイページまたは確認メールをご確認ください。",
    };
  }

  if (payment === "cancelled") {
    return {
      variant: "muted",
      title: "決済がキャンセルされました",
      description:
        "決済は完了していません。マイページまたは確認メールのリンクから再度お試しください。",
    };
  }

  return null;
}
