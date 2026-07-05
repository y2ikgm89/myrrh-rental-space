"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import { IconPhotoPlus, IconX } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

interface SeoField {
  readonly id: string;
  readonly name: string;
  readonly errorId: string;
  readonly errors?: string[] | undefined;
}

interface EventSeoFieldsProps {
  readonly fields: {
    readonly ogpImageUrl: SeoField;
    readonly ogpTitle: SeoField;
    readonly ogpDescription: SeoField;
    readonly metaDescription: SeoField;
    readonly metaKeywords: SeoField;
  };
  readonly isPending: boolean;
  readonly ogpImageUrl: string | null;
  readonly onOgpImageUrlChange: (url: string | null) => void;
  readonly defaults: {
    readonly ogpTitle: string;
    readonly ogpDescription: string;
    readonly metaDescription: string;
    readonly metaKeywords: string;
  };
}

/**
 * EventSeoFields — Event の SEO / OGP 5 フィールド入力 UI
 *
 * Posts / News / Pages とパリティを保つ:
 * - ogpImageUrl: OGP 専用画像 (省略時は thumbnailUrl を fallback)
 * - ogpTitle: OGP 専用タイトル (70 文字)
 * - ogpDescription: OGP 専用説明 (200 文字)
 * - metaDescription: meta description (160 文字)
 * - metaKeywords: meta keywords (500 文字)
 */
export function EventSeoFields({
  fields,
  isPending,
  ogpImageUrl,
  onOgpImageUrlChange,
  defaults,
}: EventSeoFieldsProps): ReactElement {
  const ogpImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "EVENT",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        onOgpImageUrlChange(selected.url);
      }
    },
  });

  const renderFieldError = (field: SeoField) =>
    field.errors && field.errors.length > 0 ? (
      <p id={field.errorId} className="text-sm text-destructive">
        {field.errors.join(", ")}
      </p>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO / OGP 設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OGP 画像 (省略時は thumbnailUrl を fallback) */}
        <div className="space-y-2">
          <Label htmlFor={fields.ogpImageUrl.id}>
            OGP 画像 (省略時はメイン画像)
          </Label>
          <div className="flex items-start gap-4">
            {ogpImageUrl ? (
              <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-border">
                <Image
                  src={ogpImageUrl}
                  alt="OGP プレビュー"
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted">
                <IconPhotoPlus
                  aria-hidden="true"
                  className="h-6 w-6 text-muted-foreground"
                />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">
                SNS シェア時に表示されます。横長比率 (1200×630 推奨)。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ogpImagePicker.openPicker()}
                  disabled={isPending}
                >
                  <IconPhotoPlus aria-hidden="true" className="mr-1 h-4 w-4" />
                  {ogpImageUrl ? "変更" : "選択"}
                </Button>
                {ogpImageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOgpImageUrlChange(null)}
                    disabled={isPending}
                  >
                    <IconX aria-hidden="true" className="mr-1 h-4 w-4" />
                    削除
                  </Button>
                ) : null}
              </div>
              {ogpImageUrl ? (
                <p className="truncate text-xs text-muted-foreground">
                  {ogpImageUrl}
                </p>
              ) : null}
              {renderFieldError(fields.ogpImageUrl)}
            </div>
          </div>
        </div>

        {/* OGP タイトル */}
        <div className="space-y-2">
          <Label htmlFor={fields.ogpTitle.id}>OGP タイトル (70 文字以内)</Label>
          <Input
            id={fields.ogpTitle.id}
            name={fields.ogpTitle.name}
            type="text"
            defaultValue={defaults.ogpTitle}
            placeholder="省略時はイベントタイトルを使用"
            maxLength={70}
            disabled={isPending}
            {...(fields.ogpTitle.errors && {
              "aria-describedby": fields.ogpTitle.errorId,
              "aria-invalid": true,
            })}
          />
          {renderFieldError(fields.ogpTitle)}
        </div>

        {/* OGP 説明 */}
        <div className="space-y-2">
          <Label htmlFor={fields.ogpDescription.id}>
            OGP 説明 (200 文字以内)
          </Label>
          <Textarea
            id={fields.ogpDescription.id}
            name={fields.ogpDescription.name}
            defaultValue={defaults.ogpDescription}
            placeholder="省略時はイベント説明を使用"
            rows={3}
            maxLength={200}
            disabled={isPending}
            {...(fields.ogpDescription.errors && {
              "aria-describedby": fields.ogpDescription.errorId,
              "aria-invalid": true,
            })}
          />
          {renderFieldError(fields.ogpDescription)}
        </div>

        {/* Meta 説明 */}
        <div className="space-y-2">
          <Label htmlFor={fields.metaDescription.id}>
            検索結果説明文 (160 文字以内)
          </Label>
          <Textarea
            id={fields.metaDescription.id}
            name={fields.metaDescription.name}
            defaultValue={defaults.metaDescription}
            placeholder="省略時はイベント説明を使用"
            rows={3}
            maxLength={160}
            disabled={isPending}
            {...(fields.metaDescription.errors && {
              "aria-describedby": fields.metaDescription.errorId,
              "aria-invalid": true,
            })}
          />
          {renderFieldError(fields.metaDescription)}
        </div>

        {/* Meta キーワード */}
        <div className="space-y-2">
          <Label htmlFor={fields.metaKeywords.id}>
            検索キーワード (カンマ区切り、500 文字以内)
          </Label>
          <Input
            id={fields.metaKeywords.id}
            name={fields.metaKeywords.name}
            type="text"
            defaultValue={defaults.metaKeywords}
            placeholder="例: ワークショップ, 渋谷, デザイン"
            maxLength={500}
            disabled={isPending}
            {...(fields.metaKeywords.errors && {
              "aria-describedby": fields.metaKeywords.errorId,
              "aria-invalid": true,
            })}
          />
          {renderFieldError(fields.metaKeywords)}
        </div>

        <input
          type="hidden"
          name={fields.ogpImageUrl.name}
          value={ogpImageUrl ?? ""}
        />
        {ogpImagePicker.mediaPickerDialog}
      </CardContent>
    </Card>
  );
}
