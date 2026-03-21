"use client";

/**
 * 投稿コンテンツタイプ設定
 *
 * PostInlineEditorで使用する完全な設定
 */

import { format } from "date-fns";
import { PostStatus } from "@/shared/db/enums";
import {
  postFormSchema,
  type PostFormData,
} from "@/admin/lib/validations/post";
import {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from "@/admin/actions/post";
import type { PostData } from "@/shared/domain/posts/types";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums";
import type { PostPreviewData } from "@/shared/types";
import {
  SEO_FIELD_NAMES,
  OGP_FIELD_NAMES,
  type ContentEditorExtraData,
  type ContentTypeConfig,
  type PostSidePanelExtra,
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
  LayoutFields,
} from "../side-panel";

type PostSubmitPayload = {
  title: string;
  slug: string;
  excerpt: string;
  contentJson: string;
  thumbnailUrl: string;
  ogpImageUrl: string | null;
  categoryId: string;
  tags: string[];
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  contentWidth: "XS" | "SM" | "MD" | "LG" | "XL" | "FULL" | "CUSTOM" | null;
  contentWidthCustom: number | null;
};

function toFormData(data?: PostData): PostFormData {
  if (!data) {
    return {
      title: "",
      slug: "",
      excerpt: "",
      contentJson: "",
      thumbnailUrl: "",
      ogpImageUrl: "",
      categoryId: "",
      tags: "",
      metaDescription: "",
      metaKeywords: "",
      ogpTitle: "",
      ogpDescription: "",
      status: PostStatus.DRAFT,
      publishedAt: "",
      contentWidth: "",
      contentWidthCustom: "",
    };
  }

  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    contentJson: data.contentJson ? JSON.stringify(data.contentJson) : "",
    thumbnailUrl: data.thumbnailUrl,
    ogpImageUrl: data.ogpImageUrl ?? "",
    categoryId: data.categoryId,
    tags: data.postTags?.map((t) => t.name).join(", ") ?? "",
    metaDescription: data.metaDescription ?? "",
    metaKeywords: data.metaKeywords ?? "",
    ogpTitle: data.ogpTitle ?? "",
    ogpDescription: data.ogpDescription ?? "",
    status: data.status,
    publishedAt: data.publishedAt
      ? format(new Date(data.publishedAt), "yyyy-MM-dd'T'HH:mm")
      : "",
    contentWidth: data.contentWidth ?? "",
    contentWidthCustom: data.contentWidthCustom?.toString() ?? "",
  };
}

function toSubmitPayload(formData: PostFormData): PostSubmitPayload {
  const tags = formData.tags
    ? formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return {
    title: formData.title,
    slug: formData.slug,
    excerpt: formData.excerpt,
    contentJson: formData.contentJson,
    thumbnailUrl: formData.thumbnailUrl,
    ogpImageUrl: formData.ogpImageUrl || null,
    categoryId: formData.categoryId,
    tags,
    metaDescription: formData.metaDescription || null,
    metaKeywords: formData.metaKeywords || null,
    ogpTitle: formData.ogpTitle || null,
    ogpDescription: formData.ogpDescription || null,
    contentWidth:
      formData.contentWidth && isValidLayoutWidth(formData.contentWidth)
        ? formData.contentWidth
        : null,
    contentWidthCustom: formData.contentWidthCustom
      ? parseInt(formData.contentWidthCustom, 10)
      : null,
  };
}

function toPreviewData(
  formData: PostFormData,
  _data?: PostData,
  extraData?: ContentEditorExtraData,
): PostPreviewData {
  const tags = formData.tags
    ? formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const selectedCategory = extraData?.categories?.find(
    (c) => c.id === formData.categoryId,
  );

  return {
    title: formData.title || "無題",
    slug: formData.slug || "preview-new",
    excerpt: formData.excerpt || "",
    contentHtml: "",
    thumbnailUrl: formData.thumbnailUrl || "",
    publishedAt: formData.publishedAt || null,
    tags,
    category: {
      name: selectedCategory?.name || "カテゴリなし",
      slug: selectedCategory?.slug || "uncategorized",
    },
  };
}

export const postConfig: ContentTypeConfig<
  PostData,
  PostFormData,
  PostPreviewData,
  PostSubmitPayload,
  PostSidePanelExtra
> = {
  id: "post",
  label: "投稿",
  listPath: "/admin/posts",
  slugPrefix: "posts/",
  previewBasePath: "/posts",

  formSchema: postFormSchema,

  features: {
    create: true,
    delete: true,
    publish: true,
    comments: true,
  },

  publishControl: {
    type: "status",
    statusEnum: PostStatus,
  },

  transforms: {
    toFormData,
    toSubmitPayload,
    toPreviewData,
  },

  actions: {
    create: createPost,
    update: updatePost,
    delete: deletePost,
    publish: publishPost,
    unpublish: unpublishPost,
  },

  sidePanel: {
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
              <TitleSlugFields<PostFormData>
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
              <ExcerptFields<PostFormData>
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
              <CategoryFields<PostFormData>
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
              <PostTagFields<PostFormData>
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
              <SEOFields<PostFormData>
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
              <OGPFields<PostFormData>
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
              <UnifiedPublishFields<PostFormData>
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
