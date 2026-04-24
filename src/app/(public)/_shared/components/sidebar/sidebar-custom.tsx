import type { ReactElement } from "react";
import Link from "next/link";
import type { CustomWidget } from "@/shared/lib/validations/sidebar";
import { isAppRoute } from "@/shared/lib/typed-routes";

interface SidebarCustomProps {
  widget: CustomWidget;
}

export function SidebarCustom({ widget }: SidebarCustomProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {widget.title}
      </h3>
      {widget.description ? (
        <p className="text-sm text-muted-foreground">{widget.description}</p>
      ) : null}
      {widget.linkUrl && isAppRoute(widget.linkUrl) ? (
        <Link
          href={widget.linkUrl}
          className="mt-3 inline-block border border-foreground px-4 py-2 text-xs uppercase tracking-[0.18em] transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {widget.linkLabel ?? widget.linkUrl}
        </Link>
      ) : widget.linkUrl ? (
        <a
          href={widget.linkUrl}
          className="mt-3 inline-block border border-foreground px-4 py-2 text-xs uppercase tracking-[0.18em] transition-colors hover:bg-accent hover:text-accent-foreground"
          target={widget.linkUrl.startsWith("http") ? "_blank" : undefined}
          rel={
            widget.linkUrl.startsWith("http")
              ? "noopener noreferrer"
              : undefined
          }
        >
          {widget.linkLabel ?? widget.linkUrl}
        </a>
      ) : null}
    </div>
  );
}
