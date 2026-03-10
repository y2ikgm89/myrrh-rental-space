"use client";

import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "./button";

interface SubmitButtonProps extends Omit<ButtonProps, "type" | "disabled"> {
  isPending: boolean;
  label: string;
  pendingLabel?: string;
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
  children,
  ...props
}: SubmitButtonProps) {
  const pending = pendingLabel ?? `${label.replace(/^(.+)$/, "$1")}中...`;

  return (
    <Button type="submit" disabled={isPending} {...props}>
      {isPending ? (
        <>
          <Loader2 className="animate-spin" />
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
