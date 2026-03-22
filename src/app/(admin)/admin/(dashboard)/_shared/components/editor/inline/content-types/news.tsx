"use client";

/**
 * お知らせコンテンツタイプ設定
 *
 * NewsInlineEditorで使用する完全な設定
 */

import { format } from "date-fns";
import {
  newsFormSchema,
  type NewsFormData,
} from "@/admin/lib/validations/news";
import {
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
} from "@/admin/actions/news";
import type { NewsData } from "@/shared/domain/news/types";
import type { LayoutWidth } from "@/shared/db/enums";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums/guards";
import type { NewsPreviewData } from "@/shared/types";
import {
  SEO_FIELD_NAMES,
  OGP_FIELD_NAMES,
  type ContentTypeConfig,
  type NewsSidePanelExtra,
  spreadOptionalDisabled,
} from "./types";
import {
  TitleSlugFields,
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
  LayoutFields,
} from "../side-panel";

type NewsSubmitPayload = {
  slug: string;
  title: string;
  contentJson: string;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
};

function toFormData(data?: NewsData): NewsFormData {
  if (!data) {
    return {
      slug: "",
      title: "",
      contentJson: "",
      isPublished: false,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      ogpImageUrl: "",
    };
  }

  return {
    slug: data.slug,
    title: data.title,
    contentJson: data.contentJson ? JSON.stringify(data.contentJson) : "",
    isPublished: data.isPublished,
    publishedAt: data.publishedAt
      ? format(new Date(data.publishedAt), "yyyy-MM-dd'T'HH:mm")
      : "",
    contentWidth: data.contentWidth ?? "",
    contentWidthCustom: data.contentWidthCustom?.toString() ?? "",
    metaDescription: data.metaDescription ?? "",
    metaKeywords: data.metaKeywords ?? "",
    ogpTitle: data.ogpTitle ?? "",
    ogpDescription: data.ogpDescription ?? "",
    ogpImageUrl: data.ogpImageUrl ?? "",
  };
}

function toSubmitPayload(formData: NewsFormData): NewsSubmitPayload {
  return {
    slug: formData.slug,
    title: formData.title,
    contentJson: formData.contentJson,
    contentWidth: isValidLayoutWidth(formData.contentWidth)
      ? formData.contentWidth
      : null,
    contentWidthCustom: formData.contentWidthCustom
      ? parseInt(formData.contentWidthCustom, 10)
      : null,
    metaDescription: formData.metaDescription || null,
    metaKeywords: formData.metaKeywords || null,
    ogpTitle: formData.ogpTitle || null,
    ogpDescription: formData.ogpDescription || null,
    ogpImageUrl: formData.ogpImageUrl || null,
  };
}

function toPreviewData(formData: NewsFormData): NewsPreviewData {
  return {
    title: formData.title || "無題",
    slug: formData.slug || "preview-new",
    contentHtml: "",
    publishedAt: formData.publishedAt || null,
  };
}

export const newsConfig: ContentTypeConfig<
  NewsData,
  NewsFormData,
  NewsPreviewData,
  NewsSubmitPayload,
  NewsSidePanelExtra
> = {
  id: "news",
  label: "お知らせ",
  listPath: "/admin/news",
  slugPrefix: "news/",
  previewBasePath: "/news",

  formSchema: newsFormSchema,

  features: {
    create: true,
    delete: true,
    publish: true,
    comments: true,
  },

  publishControl: {
    type: "isPublished",
  },

  transforms: {
    toFormData,
    toSubmitPayload,
    toPreviewData,
  },

  actions: {
    create: createNews,
    update: updateNews,
    delete: deleteNews,
    publish: publishNews,
    unpublish: unpublishNews,
  },

  sidePanel: {
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
              <TitleSlugFields<NewsFormData>
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
              <SEOFields<NewsFormData>
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
              <OGPFields<NewsFormData>
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
              <UnifiedPublishFields<NewsFormData>
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
              <LayoutFields
                register={ctx.register}
                control={ctx.control}
                errors={ctx.errors}
                setValue={ctx.setValue}
                getValues={ctx.getValues}
                {...spreadOptionalDisabled(ctx)}
              />
            ),
          },
        ],
      },
    ],
  },
};
