/**
 * ホームページ編集（セクション + SEO タブ）
 *
 * DnDでセクション順序変更、セクション別設定編集、SEO設定編集
 * 旧: /admin/settings?tab=homepage → 新: /admin/pages/homepage/edit
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getInstagramConfig } from "@/admin/queries/instagram";
import { getPageBySlug } from "@/admin/queries/page";
import { Button, Badge, Breadcrumb } from "@/admin/components/ui";
import { HomepageEditTabs } from "./_components/HomepageEditTabs";
import type { Metadata } from "next";
import type { ReactElement } from "react";

export const metadata: Metadata = {
  title: "ホームページ編集",
};

export default async function HomepageEditPage(): Promise<ReactElement> {
  const homePage = await getPageBySlug("home");
  if (!homePage) {
    notFound();
  }

  // Instagram接続状態を取得
  const instagramConfig = await getInstagramConfig();

  // SEO用データ
  const pageSeoData = {
    slug: "home",
    title: homePage.title,
    metaDescription: homePage.metaDescription,
    metaKeywords: homePage.metaKeywords,
    ogpTitle: homePage.ogpTitle,
    ogpDescription: homePage.ogpDescription,
    ogpImageUrl: homePage.ogpImageUrl,
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "ページ管理", href: "/admin/pages" },
          { label: "ホームページ" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/pages">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                ホームページ編集
              </h1>
              <Badge variant="secondary">システム</Badge>
            </div>
            <p className="text-muted-foreground">
              セクションの順序変更・設定編集・SEO設定
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            プレビュー
          </a>
        </Button>
      </div>

      <HomepageEditTabs
        isInstagramConnected={instagramConfig.isConnected}
        page={pageSeoData}
      />
    </div>
  );
}
