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
      <Container className={cn("py-[var(--spacing-region)]", className)}>
        {children}
      </Container>
    );
  }

  if (variant === "form") {
    return (
      <>
        {hero}
        <Container className={cn("py-[var(--spacing-region)]", className)}>
          {children}
        </Container>
      </>
    );
  }

  // content — hero / セクション群 / cta を統一 gap の縦スタックで並べる。
  // セクション間の余白（SectionStack の gap）と同じ --spacing-fluid-md を使い、
  // hero↔本文↔cta の境界も一定の余白に揃える。
  return (
    <div
      className={cn("flex flex-col gap-[var(--spacing-fluid-md)]", className)}
    >
      {hero}
      {children}
      {cta}
    </div>
  );
}
