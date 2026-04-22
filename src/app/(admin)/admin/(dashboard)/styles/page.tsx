/**
 * Style Library 一覧ページ
 *
 * セクション / ページ / グローバルで利用する SectionStyle を一元管理する。
 */

import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Button } from "@/admin/components/ui";
import { getSectionStyleList } from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/queries";
import { loadAdminStyleSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { StyleFilters } from "./_components/StyleFilters";
import { StyleGrid } from "./_components/StyleGrid";

export const metadata: Metadata = {
  title: "Style Library | 管理画面",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StylesPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  const params = await loadAdminStyleSearchParams(searchParams);

  const styles = await getSectionStyleList(
    omitUndefined({
      scope: params.scope === "all" ? undefined : params.scope,
      applicableType:
        params.applicableType === "all" ? undefined : params.applicableType,
      search: params.q || undefined,
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Style Library
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            ページ・セクション・グローバルで利用できるデザイン Style
            を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/admin/styles/new">
              <IconPlus className="mr-2 h-4 w-4" />
              新規作成
            </Link>
          </Button>
        </div>
      </div>

      <StyleFilters />

      <StyleGrid styles={styles} />
    </div>
  );
}
