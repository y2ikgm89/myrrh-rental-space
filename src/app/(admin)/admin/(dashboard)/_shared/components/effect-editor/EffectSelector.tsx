"use client";

/**
 * エフェクト選択 UI（スタブ）
 *
 * エフェクトレジストリは現在 @/public/ に存在するため、管理画面から直接参照できない。
 * レジストリが @/shared/ に移動されるまではプレースホルダーを表示する。
 */

import { Sparkles } from "lucide-react";

interface EffectSelectorProps {
  /** 現在選択中のエフェクト ID（将来の実装で使用） */
  selectedEffectId?: string | null;
  /** エフェクト選択時のコールバック（将来の実装で使用） */
  onSelect?: (effectId: string | null) => void;
}

export function EffectSelector(_props: EffectSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          エフェクト機能は準備中です
        </p>
        <p className="text-xs text-muted-foreground">
          エフェクト設定は今後のアップデートで利用可能になります
        </p>
      </div>
    </div>
  );
}
