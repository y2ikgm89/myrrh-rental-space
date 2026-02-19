import type { Metadata } from "next";
import { SpaceManagementTabs } from "./_components/SpaceManagementTabs";
import { SpaceTabContent } from "./_components/SpaceTabContent";
import { LocationTabContent } from "./_components/LocationTabContent";
import { CategoryTabContent } from "./_components/CategoryTabContent";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "スペース管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

export default async function SpacesPage({ searchParams }: PageProps) {
  await connection();
  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">スペース管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペース・場所・カテゴリーを一元管理します
          </p>
        </div>
      </div>

      {/* タブコンテンツ */}
      <SpaceManagementTabs
        spacesContent={<SpaceTabContent searchParams={searchParams} />}
        locationsContent={<LocationTabContent searchParams={searchParams} />}
        categoriesContent={<CategoryTabContent searchParams={searchParams} />}
      />
    </div>
  );
}
