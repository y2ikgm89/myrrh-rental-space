import type { AnnouncementBarData } from "@/shared/domain/settings/announcement-bar";
import type { Serialized } from "@/shared/lib/serialize";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";
import type { CarouselFormValues } from "@/shared/lib/validations/announcement-bar";

// =============================================================================
// Constants
// =============================================================================

export const ANIMATION_OPTIONS: readonly {
  value: AnnouncementBarAnimation;
  label: string;
  description: string;
}[] = [
  {
    value: AnnouncementBarAnimation.FADE,
    label: "フェード",
    description: "透明度でふわっと切り替え",
  },
  {
    value: AnnouncementBarAnimation.SLIDE_X,
    label: "横スライド",
    description: "左右にスライドして切り替え",
  },
  {
    value: AnnouncementBarAnimation.SLIDE_Y,
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
    value: AnnouncementBarDesignStyle.SOLID,
    label: "ソリッド",
    description: "シンプルなベタ塗り",
  },
  {
    value: AnnouncementBarDesignStyle.GRADIENT,
    label: "グラデーション",
    description: "モダンなグラデーション背景",
  },
  {
    value: AnnouncementBarDesignStyle.OUTLINED,
    label: "アウトライン",
    description: "枠線スタイルですっきり",
  },
  {
    value: AnnouncementBarDesignStyle.GLASS,
    label: "グラス",
    description: "半透明のグラスモーフィズム",
  },
  {
    value: AnnouncementBarDesignStyle.MINIMAL,
    label: "ミニマル",
    description: "細い帯のミニマルスタイル",
  },
  {
    value: AnnouncementBarDesignStyle.STRIPED,
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

/**
 * フォーム値の型。スキーマ由来（監査 A-18）。
 * 以前は 14 フィールドを手書きしており、色を非 null 化するためだけに
 * 完全な別定義になっていた。差分は色 3 キーだけなので変換関数に閉じてある。
 */
export type CarouselSettings = CarouselFormValues;

// =============================================================================
// Component Props
// =============================================================================

export type BarListProps = {
  bars: Serialized<AnnouncementBarData>[];
  isPending: boolean;
  onEdit: (bar: Serialized<AnnouncementBarData>) => void;
  onCreate: () => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onReorder: (bars: Serialized<AnnouncementBarData>[]) => void;
  onDelete: (id: string) => void;
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
