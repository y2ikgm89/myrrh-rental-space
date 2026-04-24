import { notFound } from "next/navigation";
import { getPageBuilderForEdit } from "@/admin/queries/page-builder";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageBuilderEditor } from "./_components/PageBuilderEditor";

type PageParams = Promise<{ slug: string }>;

type PageProps = {
  params: PageParams;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBuilderForEdit(slug);

  return {
    title: page ? `${page.title}を builder で編集` : "Builder",
  };
}

export default async function PageBuilderPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params;
  const page = await getPageBuilderForEdit(slug);

  if (!page) {
    notFound();
  }

  return <PageBuilderEditor page={page} />;
}
