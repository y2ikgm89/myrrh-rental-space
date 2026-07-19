import { INQUIRY_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

export type BadgeVariant = "default" | "success" | "warning" | "info";

const INQUIRY_STATUS_VARIANTS: Record<InquiryStatus, BadgeVariant> = {
  [InquiryStatus.NEW]: "info",
  [InquiryStatus.IN_PROGRESS]: "warning",
  [InquiryStatus.RESOLVED]: "success",
  [InquiryStatus.CLOSED]: "default",
  // 内部運用値。顧客画面では下の INQUIRY_STATUS_CONFIG でマスクされるため、
  // 型の網羅性を満たすためだけの entry。UI で直接読まれることは想定しない。
  [InquiryStatus.FLAGGED]: "warning",
  [InquiryStatus.SPAM]: "default",
};

/**
 * マイページ向けの Inquiry ステータス表示 SSoT。
 *
 * NEW/IN_PROGRESS/RESOLVED/CLOSED は Prisma enum 値をそのまま表示する。
 *
 * FLAGGED / SPAM は内部運用ステータスで、顧客に「SPAM 扱いにした」等の判定を
 * 直接見せるべきではない (プライバシー / 心証)。以下のマスキングを行う:
 *   - FLAGGED → IN_PROGRESS 相当の badge (「対応中」)
 *   - SPAM    → NEW 相当の badge (「新規」)
 *
 * key の型を `string` にすることで、将来 enum に別値が増えても
 * `INQUIRY_STATUS_CONFIG[status] ?? INQUIRY_STATUS_CONFIG.NEW` の fallback が
 * 静かに効く (=顧客側 UI が壊れない) 設計とする。
 */
export const INQUIRY_STATUS_CONFIG: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  [InquiryStatus.NEW]: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.NEW],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.NEW],
  },
  [InquiryStatus.IN_PROGRESS]: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.IN_PROGRESS],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.IN_PROGRESS],
  },
  [InquiryStatus.RESOLVED]: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.RESOLVED],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.RESOLVED],
  },
  [InquiryStatus.CLOSED]: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.CLOSED],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.CLOSED],
  },
  // ---- 顧客側マスキング ----
  // FLAGGED (要注意フラグ) は「対応中」として表示。判定情報の露呈を避ける。
  FLAGGED: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.IN_PROGRESS],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.IN_PROGRESS],
  },
  // SPAM は「新規」として表示。SPAM 判定そのものを顧客に見せない。
  SPAM: {
    label: INQUIRY_STATUS_LABELS[InquiryStatus.NEW],
    variant: INQUIRY_STATUS_VARIANTS[InquiryStatus.NEW],
  },
};
