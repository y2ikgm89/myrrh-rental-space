"use client";

import Link from "next/link";
import type {
  Control,
  FieldErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Switch,
  TabsContent,
} from "@/admin/components/ui";
import {
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
} from "@/admin/components/editor/inline/side-panel";
import type { SpaceEditFormData } from "../schema";

type SpaceEditPublishTabPanelProps = {
  control: Control<SpaceEditFormData>;
  register: UseFormRegister<SpaceEditFormData>;
  errors: FieldErrors<SpaceEditFormData>;
  setValue: UseFormSetValue<SpaceEditFormData>;
  getValues: UseFormGetValues<SpaceEditFormData>;
  isPending: boolean;
  reviewsFeatureEnabled: boolean;
};

export function SpaceEditPublishTabPanel({
  control,
  register,
  errors,
  setValue,
  getValues,
  isPending,
  reviewsFeatureEnabled,
}: SpaceEditPublishTabPanelProps) {
  const isPublished = useWatch({ control, name: "isPublished" });
  const reviewsEnabled = useWatch({ control, name: "reviewsEnabled" });

  return (
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
            <UnifiedPublishFields
              register={register}
              control={control}
              errors={errors}
              setValue={setValue}
              getValues={getValues}
              disabled={isPending}
              controlType="isPublished"
              fields={{ publishedAt: "publishedAt" }}
              isPublishedValue={isPublished}
              onIsPublishedChange={(value: boolean) =>
                setValue("isPublished", value, { shouldDirty: true })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>レビュー設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!reviewsFeatureEnabled ? (
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
            ) : null}
            <div className="flex items-start gap-3">
              <Switch
                id="reviewsEnabled"
                checked={reviewsEnabled}
                onCheckedChange={(checked) => {
                  setValue("reviewsEnabled", checked, { shouldDirty: true });
                }}
                disabled={isPending || !reviewsFeatureEnabled}
              />
              <div className="space-y-1">
                <label
                  htmlFor="reviewsEnabled"
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
            <SEOFields
              register={register}
              errors={errors}
              disabled={isPending}
              fields={{
                metaDescription: "metaDescription",
                metaKeywords: "metaKeywords",
              }}
            />
            <div className="border-t pt-4">
              <OGPFields
                register={register}
                control={control}
                errors={errors}
                setValue={setValue}
                disabled={isPending}
                fields={{
                  ogpTitle: "ogpTitle",
                  ogpDescription: "ogpDescription",
                  ogpImageUrl: "ogpImageUrl",
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
