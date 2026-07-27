import type { EmailResult } from "@/shared/lib/email/types";
import type {
  EventCancellationEffectOutcome,
  EventCancelChannel,
} from "@/shared/domain/events/registration-cancellation/types";

export function mapEmailResultToOutcome(
  result: EmailResult,
): EventCancellationEffectOutcome {
  if (result.ok) {
    return { status: "ok", detail: { messageId: result.messageId } };
  }
  if (result.reason === "disabled" || result.reason === "suppressed") {
    return { status: "skipped", reason: "disabled_or_suppressed" };
  }
  return { status: "error", reason: result.error };
}

export function channelLabel(channel: EventCancelChannel): string {
  switch (channel) {
    case "admin":
      return "管理者";
    case "customer-mypage":
      return "顧客（マイページ）";
    case "customer-token":
      return "顧客（メールリンク）";
    case "system":
      return "システム（自動）";
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}
