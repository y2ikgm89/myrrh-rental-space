import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Container } from "./container";

type PageLayoutVariant = "content" | "form" | "dashboard";

interface PageLayoutProps {
  readonly variant: PageLayoutVariant;
  readonly children: ReactNode;
  readonly hero?: ReactNode;
  readonly cta?: ReactNode;
  readonly className?: string;
}

export function PageLayout({
  variant,
  children,
  hero,
  cta,
  className,
}: PageLayoutProps) {
  if (variant === "dashboard") {
    return (
      <Container className={cn("py-8 md:py-12", className)}>
        {children}
      </Container>
    );
  }

  if (variant === "form") {
    return (
      <>
        {hero}
        <Container className={cn("py-[var(--spacing-section)]", className)}>
          {children}
        </Container>
      </>
    );
  }

  // content
  return (
    <>
      {hero}
      <div className={className}>{children}</div>
      {cta}
    </>
  );
}
