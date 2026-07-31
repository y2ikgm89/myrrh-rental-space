"use client";

import { useRef } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { IconChevronRight } from "@tabler/icons-react";
import { tv } from "tailwind-variants";
import { cn } from "@/shared/lib/cn";
import { Z_INDEX, adminZIndexClassName } from "@/admin/lib/styles/z-index";
import {
  assignAdminZIndex,
  useAdminZIndexImperative,
} from "@/admin/lib/styles/use-admin-z-index-layer";
import { assignRef } from "@/shared/lib/csp/use-imperative-style";

const dropdownMenuContentVariants = tv({
  base: "min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
});

const dropdownMenuItemVariants = tv({
  // WCAG 2.5.5 Enhanced — min-h-11 で 44px ヒットエリア確保（pointer / touch 両対応）
  base: "relative flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none transition-colors duration-200 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
});

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Content>) {
  const internalRef = useRef<HTMLDivElement>(null);
  useAdminZIndexImperative(internalRef, Z_INDEX.dropdown, style);

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={(node) => {
          internalRef.current = node;
          assignAdminZIndex(node, Z_INDEX.dropdown, style);
          assignRef(ref, node);
        }}
        sideOffset={sideOffset}
        className={cn(
          dropdownMenuContentVariants(),
          adminZIndexClassName(),
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuItemProps = React.ComponentPropsWithRef<
  typeof DropdownMenuPrimitive.Item
> & {
  inset?: boolean;
};

function DropdownMenuItem({
  className,
  inset,
  ref,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(dropdownMenuItemVariants(), inset && "pl-8", className)}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(dropdownMenuItemVariants(), "pl-8", className)}
      {...(checked !== undefined && { checked })}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(dropdownMenuItemVariants(), "pl-8", className)}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="12" cy="12" r="12" />
          </svg>
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

type DropdownMenuLabelProps = React.ComponentPropsWithRef<
  typeof DropdownMenuPrimitive.Label
> & {
  inset?: boolean;
};

function DropdownMenuLabel({
  className,
  inset,
  ref,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
}

type DropdownMenuSubTriggerProps = React.ComponentPropsWithRef<
  typeof DropdownMenuPrimitive.SubTrigger
> & {
  inset?: boolean;
};

function DropdownMenuSubTrigger({
  className,
  inset,
  ref,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        dropdownMenuItemVariants(),
        "cursor-default data-[state=open]:bg-accent",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {children}
      <IconChevronRight
        aria-hidden
        className="ml-auto size-4 shrink-0 text-muted-foreground"
      />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubContent>) {
  const internalRef = useRef<HTMLDivElement>(null);
  useAdminZIndexImperative(internalRef, Z_INDEX.dropdown, style);

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={(node) => {
          internalRef.current = node;
          assignAdminZIndex(node, Z_INDEX.dropdown, style);
          assignRef(ref, node);
        }}
        className={cn(
          dropdownMenuContentVariants(),
          adminZIndexClassName(),
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  // 減光に opacity を使わない。menu item は操作可能なので SC 1.4.3 の inactive
  // 例外に当たらず 4.5:1 が要るが、`opacity-60` は focus 中
  // (`focus:bg-accent focus:text-accent-foreground`) に 2.78:1 まで落ちる。
  // 実色トークンなら通常 5.99:1 / focus 5.11:1 を保てる。
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
};
