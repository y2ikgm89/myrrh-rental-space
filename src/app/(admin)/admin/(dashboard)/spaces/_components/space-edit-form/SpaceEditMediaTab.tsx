"use client";

import Image from "next/image";
import type { FieldMetadata, FormMetadata } from "@conform-to/react";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  TabsContent,
} from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { GalleryField } from "@/admin/components/gallery-field/GalleryField";

type GalleryFormItem = {
  readonly url: string;
  readonly alt?: string | undefined;
  readonly caption?: string | undefined;
};

type SpaceEditMediaTabProps<TForm extends Record<string, unknown>> = {
  isPending: boolean;
  mainImageUrl: string;
  onMainImageUrlChange: (value: string) => void;
  form: FormMetadata<TForm>;
  fields: {
    mainImageUrl: FieldMetadata<unknown, TForm>;
    gallery: FieldMetadata<GalleryFormItem[] | undefined, TForm>;
  };
};

export function SpaceEditMediaTab<TForm extends Record<string, unknown>>({
  isPending,
  mainImageUrl,
  onMainImageUrlChange,
  form,
  fields,
}: SpaceEditMediaTabProps<TForm>) {
  const mainImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) onMainImageUrlChange(selected.url);
    },
  });

  return (
    <>
      <TabsContent
        value="media"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <Card>
          <CardHeader>
            <CardTitle>画像設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>メイン画像 *</Label>
              <div className="flex items-start gap-4">
                {mainImageUrl ? (
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border">
                    <Image
                      src={mainImageUrl}
                      alt="メイン画像"
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                    <IconPhotoPlus
                      aria-hidden="true"
                      className="h-8 w-8 text-muted-foreground"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => mainImagePicker.openPicker()}
                    disabled={isPending}
                    aria-describedby={
                      fields.mainImageUrl.errors
                        ? fields.mainImageUrl.errorId
                        : undefined
                    }
                  >
                    <IconPhotoPlus
                      aria-hidden="true"
                      className="mr-2 h-4 w-4"
                    />
                    画像を選択
                  </Button>
                  {mainImageUrl && (
                    <p className="truncate text-xs text-muted-foreground">
                      {mainImageUrl}
                    </p>
                  )}
                </div>
              </div>
              {fields.mainImageUrl.errors && (
                <p
                  id={fields.mainImageUrl.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.mainImageUrl.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>追加画像（最大20枚）</Label>
              <p className="text-xs text-muted-foreground">
                並び順をドラッグで変更できます。最初の数枚は一覧カードのカルーセルに表示されます。
              </p>
              <GalleryField
                field={fields.gallery}
                form={form}
                defaultUsage="SPACE"
                max={20}
                showUrlTab={false}
                disabled={isPending}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {mainImagePicker.mediaPickerDialog}
    </>
  );
}
