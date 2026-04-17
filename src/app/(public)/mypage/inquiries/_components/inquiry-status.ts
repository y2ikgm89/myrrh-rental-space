import { INQUIRY_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

export type BadgeVariant = "default" | "success" | "warning" | "info";

const INQUIRY_STATUS_VARIANTS: Record<InquiryStatus, BadgeVariant> = {
  [InquiryStatus.NEW]: "info",
  [InquiryStatus.IN_PROGRESS]: "warning",
  [InquiryStatus.RESOLVED]: "success",
  [InquiryStatus.CLOSED]: "default",
};

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
};
