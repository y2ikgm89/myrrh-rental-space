import { notFound, redirect } from "next/navigation";
import { getPageBySlug } from "@/admin/queries/page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PageSlugPage({
  params,
}: PageProps): Promise<never> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  redirect(
    page.isSystemPage
      ? `/admin/pages/${slug}/edit`
      : `/admin/pages/${slug}/builder`,
  );
}
