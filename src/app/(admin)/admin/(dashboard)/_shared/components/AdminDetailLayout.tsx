// Server Component — 'use client' なし
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/admin/components/ui/button";
import { toAppRoute } from "@/shared/lib/typed-routes";

type AdminDetailLayoutProps = {
  backHref: string;
  backLabel?: string;
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminDetailLayout({
  backHref,
  backLabel = "一覧に戻る",
  title,
  subtitle,
  actions,
  children,
}: AdminDetailLayoutProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href={toAppRoute(backHref)}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      {/* コンテンツ */}
      {children}
    </div>
  );
}
