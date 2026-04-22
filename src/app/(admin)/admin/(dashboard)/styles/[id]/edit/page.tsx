/**
 * Style 編集ページ。
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getSectionStyleDetail } from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/queries";
import { parseSectionStylePayload } from "@/shared/lib/validations/section-style";
import { StyleEditor } from "../../_components/StyleEditor";
import type { CreateSectionStyleInput } from "@/shared/lib/validations/section-style";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getSectionStyleDetail(id);
  return {
    title: detail ? `${detail.name} を編集 | Style Library` : "Style 編集",
  };
}

function toScope(value: string): "global" | "page" | "section" {
  if (value === "global" || value === "page" || value === "section") {
    return value;
  }
  return "section";
}

export default async function EditStylePage({ params }: Props) {
  const { id } = await params;
  const detail = await getSectionStyleDetail(id);
  if (!detail) {
    notFound();
  }

  const defaultValues: CreateSectionStyleInput = {
    name: detail.name,
    scope: toScope(detail.scope),
    applicableTypes: detail.applicableTypes,
    payload: parseSectionStylePayload({
      spacing: detail.spacing,
      background: detail.background,
      container: detail.container,
      typography: detail.typography,
      animation: detail.animation,
      ...(detail.customClass !== null && { customClass: detail.customClass }),
    }),
  };

  return (
    <AdminDetailLayout
      backHref={`/admin/styles/${detail.id}`}
      backLabel="詳細に戻る"
      title={`${detail.name} を編集`}
      subtitle="spacing / background / container / typography / animation を編集できます"
    >
      <StyleEditor
        key={detail.id}
        mode={{ type: "edit", id: detail.id }}
        defaultValues={defaultValues}
      />
    </AdminDetailLayout>
  );
}
