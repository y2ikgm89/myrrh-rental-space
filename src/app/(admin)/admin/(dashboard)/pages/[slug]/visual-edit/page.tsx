import { notFound } from "next/navigation";
import { prisma } from "@/shared/db/prisma";
import { toPlainObject } from "@/shared/lib/serialize";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { PuckEditorClient } from "./_components/puck-editor-client";
import type { Metadata } from "next";
import type { ReactElement } from "react";

type PageParams = Promise<{ slug: string }>;

type PageProps = {
  params: PageParams;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `ビジュアルエディタ — ${slug}`,
  };
}

export default async function VisualEditPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params;

  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      puckData: true,
    },
  });

  if (!page) {
    notFound();
  }

  const plainPage = toPlainObject(page);

  return (
    <AdminDetailLayout
      backHref={`/admin/pages/${slug}/edit`}
      backLabel="詳細に戻る"
      title={`${plainPage.title} — ビジュアルエディタ`}
      subtitle={`/${slug}`}
    >
      <PuckEditorClient
        slug={plainPage.slug}
        initialData={plainPage.puckData}
      />
    </AdminDetailLayout>
  );
}
