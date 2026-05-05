"use client";

/**
 * SectionEditPanel — 選択中セクションを `AutoSectionForm` で編集する右ペイン。
 *
 * page-hero タイプのときは variant 選択 Select を表示し、変更時に
 * `updatePageSection` を即座に呼んで variant を切り替える。`router.refresh()`
 * 後の再フェッチで AutoSectionForm が新 variant のスキーマで初期化される
 * （discriminated union のため config 構造そのものが変わる）。
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { updatePageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { isRecord } from "@/shared/lib/serialize";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import type { DynamicSectionOptions } from "@/admin/queries/section-dynamic-options";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms/shared";

const PAGE_HERO_VARIANTS = [
  { value: "editorial-split", label: "エディトリアル分割" },
  { value: "compact", label: "コンパクト" },
  { value: "minimal", label: "ミニマル" },
] as const;

const PAGE_HERO_VARIANT_SET = new Set<string>(
  PAGE_HERO_VARIANTS.map((v) => v.value),
);

type PageHeroVariant = (typeof PAGE_HERO_VARIANTS)[number]["value"];

function isPageHeroVariant(value: string): value is PageHeroVariant {
  return PAGE_HERO_VARIANT_SET.has(value);
}

interface SectionEditPanelProps {
  readonly section: PageSectionData;
  readonly dynamicOptions: DynamicSectionOptions;
  readonly onUpdated?: () => void;
}

export function SectionEditPanel({
  section,
  dynamicOptions,
  onUpdated,
}: SectionEditPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPageHero = section.type === "page-hero";

  // page-hero variant を runtime で読み取る（SectionConfig union の direct
  // index は型不可のため unknown 経由で抽出）
  const configRecord: Record<string, unknown> = isRecord(section.config)
    ? section.config
    : {};
  const variantRaw = configRecord["variant"];
  const currentVariant: PageHeroVariant =
    isPageHero &&
    typeof variantRaw === "string" &&
    isPageHeroVariant(variantRaw)
      ? variantRaw
      : "editorial-split";

  const handleSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
        ...(payload.contentJson !== undefined
          ? { contentJson: payload.contentJson }
          : {}),
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("保存しました");
      onUpdated?.();
      router.refresh();
    });
  };

  const handleVariantChange = (value: string) => {
    if (!isPageHeroVariant(value)) return;
    if (value === currentVariant) return;
    // variant 変更時、新 variant の最小 config（variant のみ）を保存して
    // 再フェッチ。残りのフィールドはスキーマ default で補完される。
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: { variant: value },
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("バリアントを変更しました");
      onUpdated?.();
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SectionTypeIcon
            type={section.type}
            className="h-5 w-5 text-muted-foreground"
          />
          {sectionTypeLabels[section.type] ?? section.type}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPageHero && (
          <div className="space-y-2">
            <Label htmlFor="page-hero-variant">バリアント</Label>
            <Select
              value={currentVariant}
              onValueChange={handleVariantChange}
              disabled={isPending}
            >
              <SelectTrigger id="page-hero-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_HERO_VARIANTS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              バリアント変更時は即座に保存されます（未保存の変更は失われます）
            </p>
          </div>
        )}
        <AutoSectionForm
          key={`${section.id}-${currentVariant}-${section.updatedAt.toISOString()}`}
          section={section}
          dynamicOptions={dynamicOptions}
          onSave={handleSave}
          isPending={isPending}
          contentOnly
        />
      </CardContent>
    </Card>
  );
}
