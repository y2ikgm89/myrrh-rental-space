import type {
  UseFormRegister,
  UseFormSetValue,
  FieldErrors,
  Control,
} from "react-hook-form";
import type { AnnouncementBarData } from "@/shared/domain/settings/announcement-bar";
import type { PortableTextSpan } from "@/shared/lib/portable-text";
import type { Serialized } from "@/shared/lib/serialize";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Constants
// =============================================================================

export const ANIMATION_OPTIONS: readonly {
  value: AnnouncementBarAnimation;
  label: string;
  description: string;
}[] = [
  {
    value: AnnouncementBarAnimation.fade,
    label: "フェード",
    description: "透明度でふわっと切り替え",
  },
  {
    value: AnnouncementBarAnimation.slideX,
    label: "横スライド",
    description: "左右にスライドして切り替え",
  },
  {
    value: AnnouncementBarAnimation.slideY,
    label: "縦スライド",
    description: "上下にスライドして切り替え",
  },
];

export const DESIGN_STYLE_OPTIONS: readonly {
  value: AnnouncementBarDesignStyle;
  label: string;
  description: string;
}[] = [
  {
    value: AnnouncementBarDesignStyle.solid,
    label: "ソリッド",
    description: "シンプルなベタ塗り",
  },
  {
    value: AnnouncementBarDesignStyle.gradient,
    label: "グラデーション",
    description: "モダンなグラデーション背景",
  },
  {
    value: AnnouncementBarDesignStyle.outlined,
    label: "アウトライン",
    description: "枠線スタイルですっきり",
  },
  {
    value: AnnouncementBarDesignStyle.glass,
    label: "グラス",
    description: "半透明のグラスモーフィズム",
  },
  {
    value: AnnouncementBarDesignStyle.minimal,
    label: "ミニマル",
    description: "細い帯のミニマルスタイル",
  },
  {
    value: AnnouncementBarDesignStyle.striped,
    label: "ストライプ",
    description: "さりげない斜めストライプ",
  },
];

/** HEXカラー形式の正規表現 (#RRGGBB) */
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/** HEXカラーのバリデーション */
export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return true; // 空は許可
  return HEX_COLOR_REGEX.test(value);
}

// =============================================================================
// Types
// =============================================================================

export type BarFormData = {
  message: PortableTextSpan[];
  linkUrl: string;
  linkText: string;
  isActive: boolean;
  priority: number;
  startAt: string;
  endAt: string;
};

export type CarouselSettings = {
  announcementBarAnimation: AnnouncementBarAnimation;
  announcementBarDuration: number;
  announcementBarAutoPlay: boolean;
  announcementBarPauseOnHover: boolean;
  announcementBarShowArrows: boolean;
  announcementBarShowIndicator: boolean;
  announcementBarDesignStyle: AnnouncementBarDesignStyle;
  announcementBarBgColor: string;
  announcementBarTextColor: string;
  announcementBarStripeColor: string;
  announcementBarStripeAnimation: boolean;
  announcementBarGradientAnimation: boolean;
  announcementBarGlassAnimation: boolean;
  announcementBarSticky: boolean;
};

// =============================================================================
// Component Props
// =============================================================================

export type BarListProps = {
  bars: Serialized<AnnouncementBarData>[];
  isPending: boolean;
  onEdit: (bar: Serialized<AnnouncementBarData>) => void;
  onCreate: () => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
};

export type BarDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingBar: Serialized<AnnouncementBarData> | null;
  isPending: boolean;
  register: UseFormRegister<BarFormData>;
  setValue: UseFormSetValue<BarFormData>;
  control: Control<BarFormData>;
  errors: FieldErrors<BarFormData>;
  formValues: BarFormData;
  onSubmit: (e: React.FormEvent) => void;
};

export type CarouselSettingsProps = {
  settings: CarouselSettings;
  isPending: boolean;
  onSettingsChange: (settings: CarouselSettings) => void;
  onSave: () => void;
};

export type DesignPreviewProps = {
  message: string;
  linkText?: string;
  designStyle: AnnouncementBarDesignStyle;
  bgColor: string | null;
  textColor: string | null;
  stripeColor: string | null;
  stripeAnimation: boolean;
  gradientAnimation: boolean;
  glassAnimation: boolean;
};

export type DeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
};
