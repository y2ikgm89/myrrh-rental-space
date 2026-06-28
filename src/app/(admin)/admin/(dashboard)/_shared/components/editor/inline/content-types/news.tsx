"use client";

/**
 * お知らせエディタ 設定ダイアログ定義
 *
 * SettingsDialog に渡すタブ・セクション構成。conform `FieldMetadata` ベース。
 * フォーム型は `NewsSettingsFormState` (本文 contentJson を含まないメタデータ専用)。
 */

import type { NewsSettingsFormState } from "../hooks/use-news-editor";
import { generateSlug } from "@/shared/lib/slug";
import {
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
  NewsSettingsFormState,
  NewsSidePanelExtra
> = {
  title: "お知らせ設定",
  description:
    "タイトル・スラッグ・SEO・公開日など。本文中のブロック設定はエディタ右のパネルです。",
  tabStorageKey: "myrrh-inline-editor-sidepanel:news",
  tabs: [
    {
      id: "basic",
      label: "基本",
      sections: [
        {
          title: "基本情報",
          render: (ctx) => {
            const titleValue =
              typeof ctx.fields.title.value === "string"
                ? ctx.fields.title.value
                : "";
            const slugValue =
              typeof ctx.fields.slug.value === "string"
                ? ctx.fields.slug.value
                : "";
            return (
              <TitleSlugFields
                titleField={ctx.fields.title}
                slugField={ctx.fields.slug}
                slugPreviewPath="/news"
                slugPreviewValue={slugValue}
                titlePlaceholder="お知らせのタイトル"
                slugPlaceholder="news-slug"
                onAutoGenerateSlug={() => {
                  if (titleValue) {
                    ctx.form.update({
                      name: ctx.fields.slug.name,
                      value: generateSlug(titleValue),
                    });
                  }
                }}
                {...spreadOptionalDisabled(ctx)}
              />
            );
          },
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
            <SEOFields
              metaDescriptionField={ctx.fields.metaDescription}
              metaKeywordsField={ctx.fields.metaKeywords}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
        {
          title: "OGP設定",
          render: (ctx) => (
            <OGPFields
              ogpTitleField={ctx.fields.ogpTitle}
              ogpDescriptionField={ctx.fields.ogpDescription}
              ogpImageUrlField={ctx.fields.ogpImageUrl}
              {...spreadOptionalDisabled(ctx)}
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
            <UnifiedPublishFields
              controlType="isPublished"
              publishedAtField={ctx.fields.publishedAt}
              isPublishedValue={ctx.isPublishedValue}
              onIsPublishedChange={ctx.onIsPublishedChange}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
        {
          title: "レイアウト",
          render: (ctx) => (
            <LayoutFieldsConnected
              fields={ctx.fields}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
      ],
    },
  ],
};
