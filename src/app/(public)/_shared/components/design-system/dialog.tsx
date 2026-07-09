"use client";

import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn("fixed inset-0 z-50 bg-overlay", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  onCloseAutoFocus,
  onOpenAutoFocus,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Content>) {
  const restoreFocusElementRef = useRef<HTMLElement | null>(null);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-modal="true"
        onOpenAutoFocus={(event) => {
          const activeElement = document.activeElement;
          restoreFocusElementRef.current =
            activeElement instanceof HTMLElement &&
            activeElement !== document.body
              ? activeElement
              : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;

          const restoreTarget = restoreFocusElementRef.current;
          if (restoreTarget?.isConnected) {
            event.preventDefault();
            restoreTarget.focus();
          }
        }}
        className={cn(
          // Mobile canonical: 左右 16px のセーフ余白 (w-[calc(100%-2rem)])、
          // iOS dynamic viewport ツールバー対応の 100dvh、長 dialog の内部スクロール
          // 許容 (overflow-y-auto)、すべての viewport で rounded-lg (旧 sm: gate は
          // mobile で sharp 角と border の交差で hit area 端が触りにくくなるため撤去)。
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg duration-200 sm:p-6",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity duration-200 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none">
          <IconX className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">閉じる</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // pe-12: absolute right-2 top-2 h-11 w-11 の close button (44px + 8px gutter)
      // と Title/Description の右端衝突を構造的に回避。
      className={cn(
        "flex flex-col space-y-1.5 pe-12 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // BREAKING: 旧版の flex-col-reverse は destructive action が縦並び時に最下段
      // (thumb-zone) に来るため誤タップを誘発する anti-pattern。consumer 側で JSX
      // 順を意味通りに並べ、ここは JSX 順 = visual 順を保証する flex-col に統一。
      // sm: 横並びは space-x-2 → gap-2 で両軸統一 (gap は flex-direction 切替で
      // 同値・space-x は flex-col のとき無効になる)。
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-heading text-lg font-light leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
