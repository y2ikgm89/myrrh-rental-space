"use client";

/**
 * 投稿エディタ 設定ダイアログ定義
 *
 * SettingsDialog に渡すタブ・セクション構成。conform `FieldMetadata` ベース。
 * フォーム型は `PostSettingsFormData` (本文 contentJson を含まないメタデータ専用)。
 */

import type { FieldMetadata } from "@conform-to/react";
import type { PostSettingsFormData } from "@/admin/lib/validations/post";
import { generateSlug } from "@/shared/lib/slug";
import {
  type PostSidePanelExtra,
  type SidePanelDefinition,
  spreadOptionalDisabled,
} from "./types";
import {
  BasicInfoFields,
  CategoryFields,
  PostTagFields,
  ImageFields,
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
  LayoutFieldsConnected,
} from "../side-panel";

export const postSettingsPanel: SidePanelDefinition<
  PostSettingsFormData,
  PostSidePanelExtra
> = {
  title: "記事設定",
  description:
    "タイトル・スラッグ・分類・画像・SEO・公開日など。本文中のブロック設定はエディタ右のパネルです。",
  tabStorageKey: "myrrh-inline-editor-sidepanel:post",
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
              <BasicInfoFields
                titleField={ctx.fields.title}
                slugField={ctx.fields.slug}
                excerptField={ctx.fields.excerpt}
                slugPreview={slugValue}
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
        {
          title: "カテゴリ",
          render: (ctx) => (
            <CategoryFields
              categoryIdField={ctx.fields.categoryId}
              categories={ctx.categories}
              label="カテゴリ"
              {...(ctx.onCreateCategory && {
                onCreateCategory: ctx.onCreateCategory,
              })}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
        {
          title: "タグ",
          render: (ctx) => (
            <PostTagFields
              // documented exception §5 conform generic invariance:
              // tags は preprocess input 型が unknown のため境界 cast。
              tagsField={ctx.fields.tags as unknown as FieldMetadata<string[]>}
              availableTags={ctx.availableTags}
              {...(ctx.onCreateTag && { onCreateTag: ctx.onCreateTag })}
              {...spreadOptionalDisabled(ctx)}
            />
          ),
        },
        {
          title: "画像",
          render: (ctx) => (
            <ImageFields
              thumbnailUrlField={ctx.fields.thumbnailUrl}
              {...spreadOptionalDisabled(ctx)}
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
              controlType="status"
              publishedAtField={ctx.fields.publishedAt}
              statusValue={ctx.statusValue}
              onStatusChange={ctx.onStatusChange}
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
