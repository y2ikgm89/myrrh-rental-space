import type { ReactElement } from "react";
import Link from "next/link";
import type { CustomWidget } from "@/shared/lib/validations/sidebar";
import { isAppRoute } from "@/shared/lib/typed-routes";

interface SidebarCustomProps {
  widget: CustomWidget;
}

const SIDEBAR_CTA_CLASS =
  "mt-3 inline-flex min-h-11 items-center justify-center border border-foreground px-4 text-xs uppercase tracking-[0.18em] transition-colors hover:bg-accent hover:text-accent-foreground";

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
        <Link href={widget.linkUrl} className={SIDEBAR_CTA_CLASS}>
          {widget.linkLabel ?? widget.linkUrl}
        </Link>
      ) : widget.linkUrl ? (
        <a
          href={widget.linkUrl}
          className={SIDEBAR_CTA_CLASS}
          target={widget.linkUrl.startsWith("http") ? "_blank" : undefined}
          rel={widget.linkUrl.startsWith("http") ? "noreferrer" : undefined}
        >
          {widget.linkLabel ?? widget.linkUrl}
        </a>
      ) : null}
    </div>
  );
}
