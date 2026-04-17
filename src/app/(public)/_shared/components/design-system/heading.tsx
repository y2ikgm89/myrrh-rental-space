import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingTag = `h${HeadingLevel}`;

const tagMap = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
} as const satisfies Record<HeadingLevel, HeadingTag>;

// Level → utility classes. Font-size / weight / letter-spacing / line-height are
// all set by the @theme `--text-{h1..h4}` tokens, so we only apply family here.
// h1/h2 use the serif display family; h3/h4 inherit the sans body family.
const levelClasses = {
  1: "font-heading text-h1",
  2: "font-heading text-h2",
  3: "text-h3",
  4: "text-h4",
} as const satisfies Record<HeadingLevel, string>;

interface HeadingProps {
  readonly level: HeadingLevel;
  readonly children: ReactNode;
  readonly className?: string;
  readonly accent?: boolean;
}

export function Heading({ level, children, className, accent }: HeadingProps) {
  const Tag = tagMap[level];
  return (
    <>
      <Tag className={cn(levelClasses[level], className)}>{children}</Tag>
      {accent ? (
        <div className="mt-4 h-0.5 w-16 bg-accent" aria-hidden="true" />
      ) : null}
    </>
  );
}
