import { createElement, type ReactElement } from "react";
import type { IconProps } from "@tabler/icons-react";

interface DynamicTablerIconProps {
  readonly iconName: string;
  readonly className?: string;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly "aria-hidden"?: boolean | "true" | "false";
}

type IconComponent = React.FC<IconProps>;

function isIconComponent(v: unknown): v is IconComponent {
  return typeof v === "function";
}

export async function DynamicTablerIcon({
  iconName,
  className,
  size = 24,
  strokeWidth,
  "aria-hidden": ariaHidden,
}: DynamicTablerIconProps): Promise<ReactElement | null> {
  const icons = await import("@tabler/icons-react");
  const maybeIcon: unknown = Reflect.get(icons, iconName);
  if (!isIconComponent(maybeIcon)) return null;
  const props: IconProps = {
    ...(className !== undefined && { className }),
    size,
    ...(strokeWidth !== undefined && { strokeWidth }),
    ...(ariaHidden !== undefined && { "aria-hidden": ariaHidden }),
  };
  return createElement(maybeIcon, props);
}
