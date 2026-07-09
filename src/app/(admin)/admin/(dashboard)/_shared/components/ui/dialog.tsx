"use client";

import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { IconX } from "@tabler/icons-react";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import { cn } from "@/shared/lib/cn";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn("fixed inset-0 bg-overlay", className)}
      style={{ ...style, zIndex: style?.zIndex ?? Z_INDEX.dialogOverlay }}
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
  style,
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
          "fixed left-1/2 top-1/2 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-4 shadow-lg duration-200 sm:p-6",
          className,
        )}
        style={{ ...style, zIndex: style?.zIndex ?? Z_INDEX.dialog }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity duration-200 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
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
        "text-lg font-semibold leading-none tracking-tight",
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
