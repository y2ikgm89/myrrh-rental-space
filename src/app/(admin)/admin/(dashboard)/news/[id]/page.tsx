import { notFound } from "next/navigation";
import { getNewsById } from "@/admin/queries/news";
import { NewsEditor } from "../_components/NewsEditor";
import { getLayoutSettings } from "@/shared/domain/settings/queries";
import {
  getValidLayoutWidth,
  LayoutWidth,
} from "@/shared/lib/validations/enums";
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
  const news = await getNewsById(id);

  if (!news) {
    return {
      title: "お知らせが見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${news.title} | お知らせ管理 | Myrrh Rental Space`,
  };
}

export default async function EditNewsPage({ params }: PageProps) {
  const { id } = await params;

  const [news, settings] = await Promise.all([
    getNewsById(id),
    getLayoutSettings(),
  ]);

  if (!news) {
    notFound();
  }

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  };

  return (
    <NewsEditor
      news={news}
      mode="edit"
      fallbackContentWidth={fallbackContentWidth}
    />
  );
}
