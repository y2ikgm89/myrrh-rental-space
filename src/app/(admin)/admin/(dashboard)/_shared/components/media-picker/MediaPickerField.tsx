"use client";

/**
 * MediaPickerField
 *
 * RHF agnostic な単一画像選択フィールド。`<FormField>` の `<FormControl>` 配下で使う。
 *
 * UI パターン（業界標準: GitHub Avatar / YouTube サムネ / Notion カバー / Sanity Studio Image Field 準拠）:
 * - **未選択時**: 大きい dashed ドロップ枠全体がクリック可能 button。アイコン + ラベル + 推奨サイズを内包
 * - **選択済み時**: 実比率プレビュー + hover / focus-within で「変更 / 削除」オーバーレイ表示
 * - 削除は `onChange("")`（Settings の `.string().max(500)` + `emptyToNull` 契約に整合）
 *
 * a11y:
 * - 全 interactive 要素 ≥ 44px（WCAG 2.5.5 Enhanced）
 * - Block Link / Card Overlay パターン準拠（ARIA First Rule）
 * - キーボード: focus-within で overlay 表示（hover に依存しない）
 * - shadcn `<FormControl>` の Slot 注入（id / aria-describedby / aria-invalid）を primary トリガーに forward
 */

import Image from "next/image";
import { IconPhotoPlus, IconReplace, IconTrash } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { MediaUsage } from "@/admin/lib/validations/media";
import { cn } from "@/shared/lib/cn";

type AspectRatio = "square" | "wide" | "logo";

interface MediaPickerFieldProps {
  /** 現在選択中の画像 URL（未選択時は空文字） */
  value: string;
  /** 変更ハンドラ。削除時は空文字を渡す */
  onChange: (url: string) => void;
  /** プレビュー alt + 操作ボタンの aria-label に展開（必須） */
  alt: string;
  /** 入力無効化（フォーム送信中など） */
  disabled?: boolean;
  /** プレビュー比率: square=1:1 (favicon) / wide=1.91:1 (OGP) / logo=3:1 (ロゴ) */
  aspectRatio?: AspectRatio;
  /** 推奨サイズの説明（例: `1200×630px（横長 1.91:1）`） */
  recommendedSize?: string;
  /** メディアライブラリ初期表示カテゴリ */
  defaultUsage?: MediaUsage;
  /**
   * shadcn `<FormControl>` から Slot 経由で注入される。
   * primary トリガーボタンに forward して FormLabel / FormMessage と紐づける。
   * （`aria-invalid` は button role 非対応のため意図的に受け取らない。
   * エラーメッセージは `aria-describedby` 経由で FormMessage の ID として伝搬する）
   */
  id?: string;
  "aria-describedby"?: string;
}

const ASPECT_CONFIG: Record<
  AspectRatio,
  { frame: string; sizes: string; iconSize: string }
> = {
  // 正方形（favicon）— 128×128
  square: {
    frame: "w-32 aspect-square",
    sizes: "128px",
    iconSize: "h-7 w-7",
  },
  // OGP — 240×126（1.91:1）
  wide: {
    frame: "w-full max-w-[240px] aspect-[1.91/1]",
    sizes: "240px",
    iconSize: "h-7 w-7",
  },
  // ロゴ — 240×80（3:1）
  logo: {
    frame: "w-full max-w-[240px] aspect-[3/1]",
    sizes: "240px",
    iconSize: "h-6 w-6",
  },
};

export function MediaPickerField({
  value,
  onChange,
  alt,
  disabled = false,
  aspectRatio = "wide",
  recommendedSize,
  defaultUsage = "SITE",
  id,
  "aria-describedby": ariaDescribedBy,
}: MediaPickerFieldProps) {
  const picker = useSingleMediaPicker({
    defaultUsage,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) onChange(selected.url);
    },
  });

  const hasValue = value.length > 0;
  const aspect = ASPECT_CONFIG[aspectRatio];

  return (
    <div className="space-y-2">
      {hasValue ? (
        // Selected state: 実比率プレビュー + 画像下に常時表示の操作ボタン
        // （hover overlay はタッチデバイスでアクセス不可のため廃止 — GitHub README 画像 / Slack プロフィール画像パターン）
        <div className="space-y-2">
          <div
            className={cn(
              // bg-checker: 透過 PNG / SVG の透過部分を市松模様で可視化（admin.css @layer utilities）
              "relative overflow-hidden rounded-lg border border-border bg-checker",
              aspect.frame,
            )}
          >
            <Image
              src={value}
              alt={alt}
              fill
              sizes={aspect.sizes}
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => picker.openPicker()}
              disabled={disabled}
              id={id}
              aria-describedby={ariaDescribedBy}
              aria-label={`${alt}を変更`}
            >
              <IconReplace className="mr-1 h-4 w-4" aria-hidden="true" />
              変更
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange("")}
              disabled={disabled}
              aria-label={`${alt}を削除`}
              className={cn(
                // Destructive outline (業界標準: Material 3 Outlined / Bootstrap btn-outline-danger / Apple HIG bordered)
                // フル不透明度の枠で「変更」ボタン (border-input) と濃度を揃え視認性確保
                "border-destructive text-destructive",
                // Hover: 薄い destructive 背景で押せる感を強化
                "hover:border-destructive hover:bg-destructive/10 hover:text-destructive",
                // Focus: destructive context と整合する ring 色（base の ring-ring を上書き）
                "focus-visible:ring-destructive",
                // Active: 押下時の触覚フィードバック（base の active:scale-[0.98] と組み合わせ）
                "active:bg-destructive/15",
              )}
            >
              <IconTrash className="mr-1 h-4 w-4" aria-hidden="true" />
              削除
            </Button>
          </div>
        </div>
      ) : (
        // Empty state: ドロップ枠全体が単一の <button>（ARIA First Rule 準拠）
        <button
          type="button"
          onClick={() => picker.openPicker()}
          disabled={disabled}
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-label={`${alt}を選択`}
          className={cn(
            "group flex flex-col items-center justify-center gap-1.5 px-4 py-3",
            "rounded-lg border-2 border-dashed border-border bg-muted/30",
            "text-muted-foreground transition-colors",
            "hover:border-foreground/40 hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            aspect.frame,
          )}
        >
          <IconPhotoPlus
            className={cn(aspect.iconSize, "shrink-0")}
            aria-hidden="true"
          />
          <span className="text-sm font-medium">画像を選択</span>
          {recommendedSize ? (
            <span className="text-center text-xs leading-snug text-muted-foreground">
              {recommendedSize}
            </span>
          ) : null}
        </button>
      )}

      {hasValue && recommendedSize ? (
        <p className="text-xs text-muted-foreground">推奨: {recommendedSize}</p>
      ) : null}

      {picker.mediaPickerDialog}
    </div>
  );
}
