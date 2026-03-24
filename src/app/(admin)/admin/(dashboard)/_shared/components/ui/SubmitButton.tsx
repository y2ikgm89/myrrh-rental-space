"use client";

import { LoaderCircle } from "lucide-react";

import { Button, type ButtonProps } from "./button";

interface SubmitButtonProps extends Omit<ButtonProps, "type" | "disabled"> {
  isPending: boolean;
  label: string;
  pendingLabel?: string;
  /** onClick 指定時は type="button" になる（設定パネル等の非フォーム用途） */
  onClick?: () => void;
  /** 追加の無効化条件（isDirty 等） */
  disabled?: boolean;
}

/**
 * フォーム送信ボタン（isPending 状態を統一管理）
 *
 * @example
 * <SubmitButton isPending={isPending} label="保存" />
 * <SubmitButton isPending={isPending} label="予約を作成" pendingLabel="作成中..." />
 * <SubmitButton isPending={isPending} label="削除" variant="destructive" />
 */
function SubmitButton({
  isPending,
  label,
  pendingLabel,
  onClick,
  disabled,
  children,
  ...props
}: SubmitButtonProps) {
  const pending = pendingLabel ?? `${label.replace(/^(.+)$/, "$1")}中...`;

  return (
    <Button
      type={onClick ? "button" : "submit"}
      disabled={isPending || disabled}
      onClick={onClick}
      {...props}
    >
      {isPending ? (
        <>
          <LoaderCircle className="animate-spin" />
          {pending}
        </>
      ) : (
        (children ?? label)
      )}
    </Button>
  );
}

export { SubmitButton };
export type { SubmitButtonProps };
