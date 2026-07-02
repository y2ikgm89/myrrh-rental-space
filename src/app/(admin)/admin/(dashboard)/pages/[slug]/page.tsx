import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getPageBySlug } from "@/admin/queries/pages";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PageSlugPage({
  params,
}: PageProps): Promise<never> {
  await connection();

  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  redirect(`/admin/pages/${slug}/edit`);
}
