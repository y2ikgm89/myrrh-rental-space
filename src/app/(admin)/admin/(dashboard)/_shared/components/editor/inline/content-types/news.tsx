"use client";

/**
 * お知らせエディタ 設定ダイアログ定義
 *
 * SettingsDialog に渡すタブ・セクション構成。フォーム型は `NewsSettingsFormData`
 * （本文 contentJson を含まないメタデータ専用）。
 */

import type { NewsSettingsFormData } from "@/admin/lib/validations/news";
import {
  SEO_FIELD_NAMES,
  OGP_FIELD_NAMES,
  type NewsSidePanelExtra,
  type SidePanelDefinition,
  spreadOptionalDisabled,
} from "./types";
import {
  TitleSlugFields,
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
  LayoutFieldsConnected,
} from "../side-panel";

export const newsSettingsPanel: SidePanelDefinition<
  NewsSettingsFormData,
  NewsSidePanelExtra
> = {
  title: "お知らせ設定",
  description:
    "タイトル・スラッグ・SEO・公開日など。本文中のブロック設定はエディタ右のパネルです。",
  tabStorageKey: "myrrh-inline-editor-sidepanel:news",
  width: "default",
  tabs: [
    {
      id: "basic",
      label: "基本",
      sections: [
        {
          title: "基本情報",
          render: (ctx) => (
            <TitleSlugFields<NewsSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              fields={{ title: "title", slug: "slug" }}
              slugPreviewPath="/news"
              titlePlaceholder="お知らせのタイトル"
              slugPlaceholder="news-slug"
            />
          ),
        },
      ],
    },
    {
      id: "seo",
      label: "SEO・OGP",
      sections: [
        {
          title: "SEO設定",
          render: (ctx) => (
            <SEOFields<NewsSettingsFormData>
              register={ctx.register}
              errors={ctx.errors}
              {...spreadOptionalDisabled(ctx)}
              fields={SEO_FIELD_NAMES}
            />
          ),
        },
        {
          title: "OGP設定",
          render: (ctx) => (
            <OGPFields<NewsSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              {...spreadOptionalDisabled(ctx)}
              fields={OGP_FIELD_NAMES}
            />
          ),
        },
      ],
    },
    {
      id: "publish",
      label: "公開",
      sections: [
        {
          title: "公開設定",
          render: (ctx) => (
            <UnifiedPublishFields<NewsSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              controlType="isPublished"
              fields={{
                publishedAt: "publishedAt",
                isPublished: "isPublished",
              }}
              isPublishedValue={ctx.isPublishedValue}
              onIsPublishedChange={ctx.onIsPublishedChange}
            />
          ),
        },
        {
          title: "レイアウト",
          render: (ctx) => (
            <LayoutFieldsConnected
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
      ],
    },
  ],
};
