"use client";

/**
 * エフェクトパラメータフォーム（スタブ）
 *
 * エフェクトが選択されている場合にスキーマ駆動のパラメータ設定フォームを表示する。
 * エフェクトレジストリが @/shared/ に移動されるまではプレースホルダーを表示する。
 */

interface EffectParamsFormProps {
  /** 設定対象のエフェクト ID（将来の実装で使用） */
  effectId?: string | null;
  /** 現在のパラメータ値（将来の実装で使用） */
  params?: Record<string, unknown>;
  /** パラメータ変更時のコールバック（将来の実装で使用） */
  onParamsChange?: (params: Record<string, unknown>) => void;
  /** 保存処理中フラグ（将来の実装で使用） */
  isPending?: boolean;
}

export function EffectParamsForm(_props: EffectParamsFormProps) {
  return (
    <p className="text-sm text-muted-foreground">
      エフェクトを選択するとパラメータ設定が表示されます
    </p>
  );
}
