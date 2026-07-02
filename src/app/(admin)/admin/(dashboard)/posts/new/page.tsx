import { connection } from "next/server";
import { getPostCategories, getPostTags } from "@/admin/queries/post";
import { PostEditor } from "../_components/PostEditor";
import { getLayoutSettings } from "@/shared/domain/settings/queries/site";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { getValidLayoutWidth } from "@/shared/lib/validations/enums/helpers";
import type { ContentWidth } from "@/shared/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "投稿作成 | Myrrh Rental Space",
};

export default async function NewPostPage() {
  await connection();

  const [categories, tags, settings] = await Promise.all([
    getPostCategories(),
    getPostTags(),
    getLayoutSettings(),
  ]);

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  };

  return (
    <PostEditor
      categories={categories}
      tags={tags}
      mode="create"
      fallbackContentWidth={fallbackContentWidth}
    />
  );
}
