import { notFound } from "next/navigation";
import {
  getPostById,
  getPostCategories,
  getPostTags,
} from "@/admin/queries/post";
import { PostEditor } from "../_components/PostEditor";
import { getLayoutSettings } from "@/shared/domain/settings/queries/site";
import { LayoutWidth } from "@/shared/db/enums";
import { getValidLayoutWidth } from "@/shared/lib/validations/enums/helpers";
import type { ContentWidth } from "@/shared/types";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostById(id);

  if (!post) {
    return {
      title: "投稿が見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${post.title} | 投稿管理 | Myrrh Rental Space`,
  };
}

export default async function EditPostPage({ params }: PageProps) {
  const { id } = await params;

  const [post, categories, tags, settings] = await Promise.all([
    getPostById(id),
    getPostCategories(),
    getPostTags(),
    getLayoutSettings(),
  ]);

  if (!post) {
    notFound();
  }

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  };

  return (
    <PostEditor
      post={post}
      categories={categories}
      tags={tags}
      mode="edit"
      fallbackContentWidth={fallbackContentWidth}
    />
  );
}
