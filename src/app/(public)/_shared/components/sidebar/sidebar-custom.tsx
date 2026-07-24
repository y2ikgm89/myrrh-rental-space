import type { ReactElement } from "react";
import Link from "next/link";
import type { CustomWidget } from "@/shared/lib/validations/sidebar";
import { isAppRoute } from "@/shared/lib/typed-routes";
import { toSafePublicHref } from "@/shared/lib/url/safe-href";

interface SidebarCustomProps {
  widget: CustomWidget;
}

const SIDEBAR_CTA_CLASS =
  "mt-3 inline-flex min-h-11 items-center justify-center border border-foreground px-4 text-xs uppercase tracking-eyebrow transition-colors hover:bg-accent hover:text-accent-foreground";

export function SidebarCustom({ widget }: SidebarCustomProps): ReactElement {
  const safeHref = widget.linkUrl ? toSafePublicHref(widget.linkUrl) : null;
  const linkLabel = widget.linkLabel ?? widget.linkUrl;

  return (
    <div>
      <h2 className="mb-4 text-eyebrow uppercase text-muted-foreground">
        {widget.title}
      </h2>
      {widget.description ? (
        <p className="text-sm text-muted-foreground">{widget.description}</p>
      ) : null}
      {safeHref && isAppRoute(safeHref) ? (
        <Link href={safeHref} className={SIDEBAR_CTA_CLASS}>
          {linkLabel}
        </Link>
      ) : safeHref ? (
        <a
          href={safeHref}
          className={SIDEBAR_CTA_CLASS}
          target={safeHref.startsWith("http") ? "_blank" : undefined}
          rel={safeHref.startsWith("http") ? "noreferrer" : undefined}
        >
          {linkLabel}
        </a>
      ) : widget.linkUrl && widget.linkLabel ? (
        <span className={SIDEBAR_CTA_CLASS}>{widget.linkLabel}</span>
      ) : null}
    </div>
  );
}
