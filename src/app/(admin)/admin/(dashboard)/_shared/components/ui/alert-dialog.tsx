"use client";

import { useRef } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { Z_INDEX, adminZIndexClassName } from "@/admin/lib/styles/z-index";
import { useAdminZIndexImperative } from "@/admin/lib/styles/use-admin-z-index-layer";
import { assignRef } from "@/shared/lib/csp/use-imperative-style";
import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "./button";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Overlay>) {
  const internalRef = useRef<HTMLDivElement>(null);
  useAdminZIndexImperative(internalRef, Z_INDEX.dialogOverlay, style);

  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 bg-overlay",
        adminZIndexClassName(),
        className,
      )}
      {...props}
      ref={(node) => {
        internalRef.current = node;
        assignRef(ref, node);
      }}
    />
  );
}

function AlertDialogContent({
  className,
  onCloseAutoFocus,
  onOpenAutoFocus,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Content>) {
  const restoreFocusElementRef = useRef<HTMLElement | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);
  useAdminZIndexImperative(internalRef, Z_INDEX.dialog, style);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={(node) => {
          internalRef.current = node;
          assignRef(ref, node);
        }}
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
          adminZIndexClassName(),
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-2 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
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

function AlertDialogTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
