import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { adminSpaceSearchParamsCache } from "@/shared/lib/nuqs";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { Button } from "@/admin/components/ui";
import { CreateCategoryDialog } from "../space-categories/_components/CreateCategoryDialog";
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

function HeaderAction({ tab }: { tab: AdminSpaceManagementTab }) {
  switch (tab) {
    case "spaces":
      return (
        <Button asChild>
          <Link href="/admin/spaces/new">
            <IconPlus className="mr-2 h-4 w-4" />
            新規スペース作成
          </Link>
        </Button>
      );
    case "locations":
      return (
        <Button asChild>
          <Link href="/admin/locations/new">
            <IconPlus className="mr-2 h-4 w-4" />
            新規場所作成
          </Link>
        </Button>
      );
    case "categories":
      return <CreateCategoryDialog />;
    case "reviews":
      return null;
  }
}

export default async function SpacesPage({ searchParams }: PageProps) {
  await adminSpaceSearchParamsCache.parse(searchParams);
  const tab = adminSpaceSearchParamsCache.get("tab");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            スペース管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペース・場所・カテゴリー・レビューを一元管理します
          </p>
        </div>
        <HeaderAction tab={tab} />
      </div>

      <SpaceManagementTabs>{tabPanel(tab)}</SpaceManagementTabs>
    </div>
  );
}
