"use client";

import Image from "next/image";
import Link from "next/link";
import type { FieldMetadata } from "@conform-to/react";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  TabsContent,
  Textarea,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

type SpaceEditPublishTabProps = {
  isPending: boolean;
  reviewsFeatureEnabled: boolean;
  isPublished: boolean;
  onIsPublishedChange: (value: boolean) => void;
  reviewsEnabled: boolean;
  onReviewsEnabledChange: (value: boolean) => void;
  metaDescription: string;
  onMetaDescriptionChange: (value: string) => void;
  metaKeywords: string;
  onMetaKeywordsChange: (value: string) => void;
  ogpTitle: string;
  onOgpTitleChange: (value: string) => void;
  ogpDescription: string;
  onOgpDescriptionChange: (value: string) => void;
  ogpImageUrl: string;
  onOgpImageUrlChange: (value: string) => void;
  fields: {
    isPublished: FieldMetadata<unknown>;
    metaDescription: FieldMetadata<unknown>;
    metaKeywords: FieldMetadata<unknown>;
    ogpTitle: FieldMetadata<unknown>;
    ogpDescription: FieldMetadata<unknown>;
    ogpImageUrl: FieldMetadata<unknown>;
  };
};

export function SpaceEditPublishTab({
  isPending,
  reviewsFeatureEnabled,
  isPublished,
  onIsPublishedChange,
  reviewsEnabled,
  onReviewsEnabledChange,
  metaDescription,
  onMetaDescriptionChange,
  metaKeywords,
  onMetaKeywordsChange,
  ogpTitle,
  onOgpTitleChange,
  ogpDescription,
  onOgpDescriptionChange,
  ogpImageUrl,
  onOgpImageUrlChange,
  fields,
}: SpaceEditPublishTabProps) {
  const ogpImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) onOgpImageUrlChange(selected.url);
    },
  });

  return (
    <>
      <TabsContent
        value="publish"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Switch
                  id="space-isPublished"
                  checked={isPublished}
                  onCheckedChange={onIsPublishedChange}
                  disabled={isPending}
                  aria-invalid={fields.isPublished.errors ? true : undefined}
                  aria-describedby={
                    fields.isPublished.errors
                      ? fields.isPublished.errorId
                      : undefined
                  }
                />
                <div className="space-y-1">
                  <label
                    htmlFor="space-isPublished"
                    className="text-sm font-medium leading-none"
                  >
                    公開する
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {isPublished
                      ? "このスペースは公開ページに表示されます"
                      : "オフにすると非公開になります"}
                  </p>
                </div>
              </div>
              {fields.isPublished.errors && (
                <p
                  id={fields.isPublished.errorId}
                  className="mt-2 text-sm text-destructive"
                >
                  {fields.isPublished.errors.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>レビュー設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!reviewsFeatureEnabled && (
                <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm text-muted-foreground">
                  レビュー機能はサイト全体で無効化されています。この設定は{" "}
                  <Link
                    href="/admin/settings/features"
                    className="underline hover:text-foreground"
                  >
                    機能モジュール設定
                  </Link>{" "}
                  で変更できます。個別の ON/OFF は Global ON 時のみ有効です。
                </div>
              )}
              <div className="flex items-start gap-3">
                <Switch
                  id="space-reviewsEnabled"
                  checked={reviewsEnabled}
                  onCheckedChange={onReviewsEnabledChange}
                  disabled={isPending || !reviewsFeatureEnabled}
                />
                <div className="space-y-1">
                  <label
                    htmlFor="space-reviewsEnabled"
                    className="text-sm font-medium leading-none"
                  >
                    レビュー機能を有効化
                  </label>
                  <p className="text-sm text-muted-foreground">
                    オフにすると公開ページでレビューが非表示になり、顧客は新規投稿できなくなります。既存のレビューは削除されません。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO・OGP 設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="space-metaDescription">
                    メタディスクリプション
                  </Label>
                  <Textarea
                    id="space-metaDescription"
                    value={metaDescription}
                    onChange={(e) => onMetaDescriptionChange(e.target.value)}
                    placeholder="検索結果に表示される説明文（160文字以内推奨）"
                    rows={3}
                    disabled={isPending}
                    aria-invalid={
                      fields.metaDescription.errors ? true : undefined
                    }
                    aria-describedby={
                      fields.metaDescription.errors
                        ? fields.metaDescription.errorId
                        : undefined
                    }
                  />
                  {fields.metaDescription.errors && (
                    <p
                      id={fields.metaDescription.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.metaDescription.errors.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    検索エンジンの結果ページに表示される説明文です
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="space-metaKeywords">メタキーワード</Label>
                  <Input
                    id="space-metaKeywords"
                    value={metaKeywords}
                    onChange={(e) => onMetaKeywordsChange(e.target.value)}
                    placeholder="キーワード1, キーワード2, キーワード3"
                    disabled={isPending}
                    aria-invalid={fields.metaKeywords.errors ? true : undefined}
                    aria-describedby={
                      fields.metaKeywords.errors
                        ? fields.metaKeywords.errorId
                        : undefined
                    }
                  />
                  {fields.metaKeywords.errors && (
                    <p
                      id={fields.metaKeywords.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.metaKeywords.errors.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    カンマ区切りでキーワードを入力
                  </p>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="space-ogpTitle">OGPタイトル</Label>
                  <Input
                    id="space-ogpTitle"
                    value={ogpTitle}
                    onChange={(e) => onOgpTitleChange(e.target.value)}
                    placeholder="SNSシェア時のタイトル（100文字以内推奨）"
                    disabled={isPending}
                    aria-invalid={fields.ogpTitle.errors ? true : undefined}
                    aria-describedby={
                      fields.ogpTitle.errors
                        ? fields.ogpTitle.errorId
                        : undefined
                    }
                  />
                  {fields.ogpTitle.errors && (
                    <p
                      id={fields.ogpTitle.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.ogpTitle.errors.join(", ")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="space-ogpDescription">OGP説明文</Label>
                  <Textarea
                    id="space-ogpDescription"
                    value={ogpDescription}
                    onChange={(e) => onOgpDescriptionChange(e.target.value)}
                    placeholder="SNSシェア時の説明文（200文字以内推奨）"
                    rows={3}
                    disabled={isPending}
                    aria-invalid={
                      fields.ogpDescription.errors ? true : undefined
                    }
                    aria-describedby={
                      fields.ogpDescription.errors
                        ? fields.ogpDescription.errorId
                        : undefined
                    }
                  />
                  {fields.ogpDescription.errors && (
                    <p
                      id={fields.ogpDescription.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.ogpDescription.errors.join(", ")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>OGP画像</Label>
                  <div className="flex items-start gap-3">
                    {ogpImageUrl ? (
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
                        <Image
                          src={ogpImageUrl}
                          alt="OGP画像"
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                        <IconPhotoPlus
                          aria-hidden="true"
                          className="h-5 w-5 text-muted-foreground"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => ogpImagePicker.openPicker()}
                        disabled={isPending}
                        aria-describedby={
                          fields.ogpImageUrl.errors
                            ? fields.ogpImageUrl.errorId
                            : undefined
                        }
                      >
                        <IconPhotoPlus
                          aria-hidden="true"
                          className="mr-1 h-3 w-3"
                        />
                        選択
                      </Button>
                      {ogpImageUrl && (
                        <p className="truncate text-xs text-muted-foreground">
                          {ogpImageUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  {fields.ogpImageUrl.errors && (
                    <p
                      id={fields.ogpImageUrl.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.ogpImageUrl.errors.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    推奨サイズ: 1200x630px
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {ogpImagePicker.mediaPickerDialog}
    </>
  );
}
