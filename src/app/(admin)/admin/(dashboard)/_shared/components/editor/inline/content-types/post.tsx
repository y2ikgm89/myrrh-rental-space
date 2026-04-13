"use client";

/**
 * 投稿エディタ 設定ダイアログ定義
 *
 * SettingsDialog に渡すタブ・セクション構成。フォーム型は `PostSettingsFormData`
 * （本文 contentJson を含まないメタデータ専用）。
 */

import type { PostSettingsFormData } from "@/admin/lib/validations/post";
import {
  SEO_FIELD_NAMES,
  OGP_FIELD_NAMES,
  type PostSidePanelExtra,
  type SidePanelDefinition,
  spreadOptionalDisabled,
} from "./types";
import {
  TitleSlugFields,
  ExcerptFields,
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
  width: "default",
  tabs: [
    {
      id: "basic",
      label: "基本",
      sections: [
        {
          title: "基本情報",
          render: (ctx) => (
            <TitleSlugFields<PostSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              fields={{ title: "title", slug: "slug" }}
              slugPreviewPath="/posts"
              titlePlaceholder="記事のタイトル"
              slugPlaceholder="article-slug"
            />
          ),
        },
        {
          title: "抜粋",
          render: (ctx) => (
            <ExcerptFields<PostSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              fields={{ excerpt: "excerpt" }}
              label="抜粋"
              placeholder="記事の抜粋（一覧ページに表示）"
              helpText="500文字以内"
            />
          ),
        },
        {
          title: "カテゴリ",
          render: (ctx) => (
            <CategoryFields<PostSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              fields={{ categoryId: "categoryId" }}
              categories={[...ctx.categories]}
              label="カテゴリ"
              onCreateCategory={ctx.onCreateCategory}
            />
          ),
        },
        {
          title: "タグ",
          render: (ctx) => (
            <PostTagFields<PostSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              fields={{ tags: "tags" }}
              availableTags={[...ctx.availableTags]}
              onCreateTag={ctx.onCreateTag}
            />
          ),
        },
        {
          title: "画像",
          render: (ctx) => (
            <ImageFields
              errors={ctx.errors}
              setValue={ctx.setValue}
              control={ctx.control}
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
            <SEOFields<PostSettingsFormData>
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
            <OGPFields<PostSettingsFormData>
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
            <UnifiedPublishFields<PostSettingsFormData>
              register={ctx.register}
              control={ctx.control}
              errors={ctx.errors}
              setValue={ctx.setValue}
              getValues={ctx.getValues}
              {...spreadOptionalDisabled(ctx)}
              controlType="status"
              fields={{
                publishedAt: "publishedAt",
                status: "status",
              }}
              statusValue={ctx.statusValue}
              onStatusChange={ctx.onStatusChange}
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
