"use client";

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
};

export function SpaceEditPublishTabPanel({
  control,
  register,
  errors,
  setValue,
  getValues,
  isPending,
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
          <CardContent className="space-y-2">
            <div className="flex items-start gap-3">
              <Switch
                id="reviewsEnabled"
                checked={reviewsEnabled}
                onCheckedChange={(checked) => {
                  setValue("reviewsEnabled", checked, { shouldDirty: true });
                }}
                disabled={isPending}
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
