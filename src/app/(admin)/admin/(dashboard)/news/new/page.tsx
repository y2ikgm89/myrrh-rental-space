import { NewsEditor } from "../_components/NewsEditor";
import { getLayoutSettings } from "@/shared/domain/settings/queries/site";
import { LayoutWidth } from "@/shared/db/enums";
import { getValidLayoutWidth } from "@/shared/lib/validations/enums/helpers";
import type { ContentWidth } from "@/shared/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お知らせ作成 | Myrrh Rental Space",
};

export default async function NewNewsPage() {
  const settings = await getLayoutSettings();

  const fallbackContentWidth: ContentWidth = {
    width: getValidLayoutWidth(settings?.contentWidth, LayoutWidth.MD),
    customPx: settings?.contentWidthCustom ?? null,
  };

  return (
    <NewsEditor mode="create" fallbackContentWidth={fallbackContentWidth} />
  );
}
