import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { SpaceManagementTabs } from "./_components/SpaceManagementTabs";
import { SpaceTabContent } from "./_components/SpaceTabContent";
import { LocationTabContent } from "./_components/LocationTabContent";
import { CategoryTabContent } from "./_components/CategoryTabContent";
import { ReviewTabContent } from "./_components/ReviewTabContent";

export const metadata: Metadata = {
  title: "スペース管理 | Myrrh Rental Space",
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function tabPanel(tab: AdminSpaceManagementTab) {
  switch (tab) {
    case "spaces":
      return <SpaceTabContent />;
    case "locations":
      return <LocationTabContent />;
    case "categories":
      return <CategoryTabContent />;
    case "reviews":
      return <ReviewTabContent />;
  }
}

export default async function SpacesPage({ searchParams }: PageProps) {
  await adminSpaceSearchParamsCache.parse(searchParams);
  const tab = adminSpaceSearchParamsCache.get("tab");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          スペース管理
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          スペース・場所・カテゴリー・レビューを一元管理します
        </p>
      </div>

      <SpaceManagementTabs activeTab={tab}>{tabPanel(tab)}</SpaceManagementTabs>
    </div>
  );
}
