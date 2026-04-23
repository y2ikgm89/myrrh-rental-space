/**
 * Style 新規作成ページ。
 * `?baseId=<id>` があれば派生モードで初期化する。
 */

import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getSectionStyleDetail } from "@/admin/queries/section-styles";
import { StyleEditor } from "../_components/StyleEditor";
import type { CreateSectionStyleInput } from "@/shared/lib/validations/section-style";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";
import { parseSectionStylePayload } from "@/shared/lib/validations/section-style";

export const metadata: Metadata = {
  title: "Style 新規作成 | 管理画面",
};

type PageProps = {
  searchParams: Promise<{ baseId?: string }>;
};

function toScope(value: string): "global" | "page" | "section" {
  if (value === "global" || value === "page" || value === "section") {
    return value;
  }
  return "section";
}

export default async function NewStylePage({ searchParams }: PageProps) {
  const { baseId } = await searchParams;

  let defaultValues: Partial<CreateSectionStyleInput> | undefined;
  let mode: { type: "create" } | { type: "derive"; baseId: string } = {
    type: "create",
  };

  if (baseId) {
    const base = await getSectionStyleDetail(baseId);
    if (base) {
      mode = { type: "derive", baseId };
      const payload: SectionStylePayload = parseSectionStylePayload({
        spacing: base.spacing,
        background: base.background,
        container: base.container,
        typography: base.typography,
        animation: base.animation,
        ...(base.customClass !== null && { customClass: base.customClass }),
      });
      defaultValues = {
        name: `${base.name} (派生)`,
        scope: toScope(base.scope),
        applicableTypes: base.applicableTypes,
        payload,
      };
    }
  }

  if (!defaultValues) {
    defaultValues = {
      name: "",
      scope: "section",
      applicableTypes: [],
      payload: DEFAULT_SECTION_STYLE,
    };
  }

  return (
    <AdminDetailLayout
      backHref="/admin/styles"
      title={mode.type === "derive" ? "派生 Style を作成" : "Style 新規作成"}
      subtitle={
        mode.type === "derive"
          ? "既存 Style から値を継承した新しい Style を作成します"
          : "ページ・セクションに適用する新しい Style を作成します"
      }
    >
      <StyleEditor
        key={baseId ?? "new"}
        mode={mode}
        defaultValues={defaultValues}
      />
    </AdminDetailLayout>
  );
}
