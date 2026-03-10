/**
 * セクション config 値 → Tailwind クラスの変換マップ
 *
 * 各セクションコンポーネントがconfig値をTailwindクラスに変換する際に使用。
 */

import type {
  ImageAspect,
  CardStyle,
  BorderRadius,
  ContainerWidth,
  GapSize,
  ContentPosition,
  OverlayStyle,
  HeroParallaxHeight,
  GalleryHoverEffect,
  GalleryGap,
} from "@/shared/lib/validations/section-options";

/** 画像アスペクト比 → Tailwind aspect クラス */
export const IMAGE_ASPECT_MAP: Record<ImageAspect, string> = {
  original: "",
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "3:2": "aspect-[3/2]",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
};

/** カードスタイル → Tailwind クラス */
export const CARD_STYLE_MAP: Record<CardStyle, string> = {
  bordered: "rounded-lg border border-border bg-card",
  shadow: "rounded-lg bg-card shadow-md",
  minimal: "rounded-lg bg-transparent",
};

/** 角丸 → Tailwind クラス */
export const BORDER_RADIUS_MAP: Record<BorderRadius, string> = {
  none: "rounded-none",
  sm: "rounded-lg",
  lg: "rounded-2xl",
};

/** コンテナ幅 → Tailwind クラス */
export const CONTAINER_WIDTH_MAP: Record<ContainerWidth, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  full: "max-w-full",
};

/** ギャップ → Tailwind クラス */
export const GAP_MAP: Record<GapSize, string> = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

/** グリッド列数 → Tailwind クラス (1〜6列) */
export const GRID_COLS_MAP: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
  6: "md:grid-cols-3 lg:grid-cols-6",
};

/** デフォルトのグリッド列クラス（マップにない値用） */
export const DEFAULT_GRID_COLS = "md:grid-cols-3";

/** コンテンツ配置 → Tailwind flex クラス */
export const CONTENT_POSITION_MAP: Record<ContentPosition, string> = {
  center: "items-center justify-center text-center",
  left: "items-center justify-center text-left",
  "bottom-left": "items-end justify-end text-left pb-16",
};

/** オーバーレイスタイル → CSS */
export const OVERLAY_STYLE_MAP: Record<OverlayStyle, string> = {
  gradient: "bg-gradient-to-t from-black/70 via-black/30 to-black/10",
  solid: "bg-black/50",
  none: "",
};

/** HeroParallax 高さ → Tailwind/CSS クラス */
export const HERO_PARALLAX_HEIGHT_MAP: Record<HeroParallaxHeight, string> = {
  full: "h-screen",
  "80vh": "h-[80vh]",
  "60vh": "h-[60vh]",
};

/** ギャラリー ホバーエフェクト → Tailwind クラス */
export const GALLERY_HOVER_EFFECT_MAP: Record<
  GalleryHoverEffect,
  { wrapper: string; overlay: string }
> = {
  zoom: { wrapper: "group overflow-hidden", overlay: "" },
  overlay: {
    wrapper: "group overflow-hidden",
    overlay: "opacity-0 group-hover:opacity-100 transition-opacity",
  },
  none: { wrapper: "", overlay: "" },
};

/**
 * グリッド列数からTailwindクラスを取得
 */
export function getGridColsClass(columns: number): string {
  return GRID_COLS_MAP[columns] ?? DEFAULT_GRID_COLS;
}

// =============================================================================
// カードグリッド（SpaceList / PostList 用）
// =============================================================================

/** カードグリッド列数 → Tailwind クラス (1〜4列, sm: ブレークポイント) */
export const CARD_GRID_COLS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

/** デフォルトのカードグリッド列クラス */
export const DEFAULT_CARD_GRID_COLS =
  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

/**
 * カードグリッド列数からTailwindクラスを取得（SpaceList / PostList 用）
 */
export function getCardGridColsClass(columns: number): string {
  return CARD_GRID_COLS_MAP[columns] ?? DEFAULT_CARD_GRID_COLS;
}

// =============================================================================
// ギャラリー固有マップ
// =============================================================================

/** ギャラリー ギャップ → Tailwind クラス（'none' 対応） */
export const GALLERY_GAP_MAP: Record<GalleryGap, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

/** ギャラリー グリッド列数 → Tailwind クラス (1〜6列, sm: ブレークポイント) */
export const GALLERY_GRID_COLS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
};

/** デフォルトのギャラリーグリッド列クラス */
export const DEFAULT_GALLERY_GRID_COLS =
  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

/**
 * ギャラリーグリッド列数からTailwindクラスを取得
 */
export function getGalleryGridColsClass(columns: number): string {
  return GALLERY_GRID_COLS_MAP[columns] ?? DEFAULT_GALLERY_GRID_COLS;
}

/** Masonry 列数 → Tailwind CSS columns クラス (1〜6列) */
export const MASONRY_COLUMNS_MAP: Record<number, string> = {
  1: "columns-1",
  2: "columns-1 sm:columns-2",
  3: "columns-1 sm:columns-2 lg:columns-3",
  4: "columns-2 lg:columns-4",
  5: "columns-2 md:columns-3 lg:columns-5",
  6: "columns-2 md:columns-3 lg:columns-6",
};

/** デフォルトの Masonry 列クラス */
export const DEFAULT_MASONRY_COLS = "columns-1 sm:columns-2 lg:columns-3";

/**
 * Masonry 列数から Tailwind CSS columns クラスを取得
 */
export function getMasonryColsClass(columns: number): string {
  return MASONRY_COLUMNS_MAP[columns] ?? DEFAULT_MASONRY_COLS;
}
