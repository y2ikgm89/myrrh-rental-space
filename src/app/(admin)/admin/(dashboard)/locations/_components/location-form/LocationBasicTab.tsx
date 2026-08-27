"use client";
import { conformFieldText } from "@/shared/lib/conform/field-text";

import Image from "next/image";
import { getInputProps } from "@conform-to/react";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Switch,
  Textarea,
  DndContext,
  closestCenter,
  SortableContext,
  verticalListSortingStrategy,
} from "@/admin/components/ui";
import { BUSINESS_ATTRIBUTE_OPTIONS } from "@/shared/lib/business-attributes";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";
import { LocationBusinessHoursCard } from "../LocationBusinessHoursCard";
import {
  SortableAccessLineItem,
  SortableImageItem,
} from "./sortable-list-items";
import type { LocationBasicTabProps } from "./types";

export function LocationBasicTab({
  isPending,
  form,
  fields,
  name,
  setName,
  description,
  setDescription,
  postalCode,
  setPostalCode,
  prefecture,
  setPrefecture,
  city,
  setCity,
  imageUrl,
  amenities,
  setAmenities,
  isPublished,
  setIsPublished,
  businessHours,
  setBusinessHours,
  accessLinesList,
  imageUrlsList,
  accessLinesDndContextId,
  dndContextId,
  sensors,
  onAccessLineDragEnd,
  onImageDragEnd,
  onOpenMainImagePicker,
  onOpenAdditionalImagesPicker,
}: LocationBasicTabProps) {
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location-name">
              場所名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: Myrrhビル"
              disabled={isPending}
              aria-invalid={fields.name.errors ? true : undefined}
              aria-describedby={
                fields.name.errors ? fields.name.errorId : undefined
              }
            />
            {fields.name.errors && (
              <p id={fields.name.errorId} className="text-sm text-destructive">
                {fields.name.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.slug.id}>
              スラッグ（URL 識別子） <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.slug, { type: "text" })}
              placeholder="honkan"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              公開アンカー:{" "}
              <code>
                /access#{conformFieldText(fields.slug.value) || "slug"}
              </code>
              。 小文字英数字とハイフンのみ。/access ページ内の章 anchor
              として使われ、JSON-LD `@id` にも影響します。
            </p>
            {fields.slug.errors && (
              <p id={fields.slug.errorId} className="text-sm text-destructive">
                {fields.slug.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-description">説明</Label>
            <Textarea
              id="location-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="建物・施設の説明を入力..."
              rows={4}
              disabled={isPending}
              aria-invalid={fields.description.errors ? true : undefined}
              aria-describedby={
                fields.description.errors
                  ? fields.description.errorId
                  : undefined
              }
            />
            {fields.description.errors && (
              <p
                id={fields.description.errorId}
                className="text-sm text-destructive"
              >
                {fields.description.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.address.id}>
              住所 <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.address, { type: "text" })}
              placeholder="例: 東京都渋谷区..."
              disabled={isPending}
            />
            {fields.address.errors && (
              <p
                id={fields.address.errorId}
                className="text-sm text-destructive"
              >
                {fields.address.errors.join(", ")}
              </p>
            )}
          </div>

          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">
              住所詳細（構造化データ用）
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location-postalCode">郵便番号</Label>
                <Input
                  id="location-postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="150-0001"
                  disabled={isPending}
                  aria-invalid={fields.postalCode.errors ? true : undefined}
                  aria-describedby={
                    fields.postalCode.errors
                      ? fields.postalCode.errorId
                      : undefined
                  }
                />
                {fields.postalCode.errors && (
                  <p
                    id={fields.postalCode.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.postalCode.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-prefecture">都道府県</Label>
                <Input
                  id="location-prefecture"
                  value={prefecture}
                  onChange={(e) => setPrefecture(e.target.value)}
                  placeholder="東京都"
                  disabled={isPending}
                  aria-invalid={fields.prefecture.errors ? true : undefined}
                  aria-describedby={
                    fields.prefecture.errors
                      ? fields.prefecture.errorId
                      : undefined
                  }
                />
                {fields.prefecture.errors && (
                  <p
                    id={fields.prefecture.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.prefecture.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location-city">市区町村</Label>
                <Input
                  id="location-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="渋谷区"
                  disabled={isPending}
                  aria-invalid={fields.city.errors ? true : undefined}
                  aria-describedby={
                    fields.city.errors ? fields.city.errorId : undefined
                  }
                />
                {fields.city.errors && (
                  <p
                    id={fields.city.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.city.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.streetAddress.id}>番地</Label>
                <Input
                  {...getInputProps(fields.streetAddress, {
                    type: "text",
                  })}
                  placeholder="神宮前1-1-1"
                  disabled={isPending}
                />
                {fields.streetAddress.errors && (
                  <p
                    id={fields.streetAddress.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.streetAddress.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.buildingName.id}>建物名・階</Label>
              <Input
                {...getInputProps(fields.buildingName, { type: "text" })}
                placeholder="Myrrhビル 3F"
                disabled={isPending}
              />
              {fields.buildingName.errors && (
                <p
                  id={fields.buildingName.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.buildingName.errors.join(", ")}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              構造化住所は LocalBusiness JSON-LD
              で使用されます。上の「住所」は表示用、ここは検索エンジン用です。
            </p>
          </fieldset>

          <div className="space-y-2">
            <Label>アクセス</Label>
            <p className="text-sm text-muted-foreground">
              最寄り駅・路線・徒歩分数等を 1 経路ずつ入力します。並べ替え可。
            </p>
            <div className="space-y-2">
              <DndContext
                id={accessLinesDndContextId}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onAccessLineDragEnd}
              >
                <SortableContext
                  items={accessLinesList.map((item) => item.key ?? "")}
                  strategy={verticalListSortingStrategy}
                >
                  {accessLinesList.map((item, index) => (
                    <SortableAccessLineItem
                      key={item.key}
                      id={item.key ?? ""}
                      index={index}
                      itemField={item}
                      disabled={isPending}
                      onRemove={() => {
                        form.remove({
                          name: fields.accessLines.name,
                          index,
                        });
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.insert({
                    name: fields.accessLines.name,
                    defaultValue: { value: "" },
                  });
                }}
                disabled={isPending || accessLinesList.length >= 20}
                aria-invalid={fields.accessLines.errors ? true : undefined}
                aria-describedby={
                  fields.accessLines.errors
                    ? fields.accessLines.errorId
                    : undefined
                }
              >
                + 経路を追加
              </Button>
              {accessLinesList.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  まだ経路がありません。「+ 経路を追加」で 1
                  行目を追加してください。
                </p>
              )}
              {fields.accessLines.errors && (
                <p
                  id={fields.accessLines.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.accessLines.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.parkingInfo.id}>駐車場案内</Label>
            <Textarea
              {...getInputProps(fields.parkingInfo, { type: "text" })}
              placeholder={`例: 専用駐車場 3台\n近隣コインパーキング: タイムズ神宮前（徒歩1分・24時間）`}
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              この拠点の駐車場情報。拠点ごとに設定できます。
            </p>
            {fields.parkingInfo.errors && (
              <p
                id={fields.parkingInfo.errorId}
                className="text-sm text-destructive"
              >
                {fields.parkingInfo.errors.join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <LocationBusinessHoursCard
        businessHours={businessHours}
        onBusinessHoursChange={setBusinessHours}
        disabled={isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle>画像設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              建物画像 <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-start gap-4">
              {imageUrl ? (
                <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                  <Image
                    src={imageUrl}
                    alt="建物画像"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed bg-muted">
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
                  onClick={onOpenMainImagePicker}
                  disabled={isPending}
                  aria-invalid={fields.imageUrl.errors ? true : undefined}
                  aria-describedby={
                    fields.imageUrl.errors ? fields.imageUrl.errorId : undefined
                  }
                >
                  <IconPhotoPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                  画像を選択
                </Button>
                {imageUrl && (
                  <p className="truncate text-sm text-muted-foreground">
                    {imageUrl}
                  </p>
                )}
              </div>
            </div>
            {fields.imageUrl.errors && (
              <p
                id={fields.imageUrl.errorId}
                className="text-sm text-destructive"
              >
                {fields.imageUrl.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">
              追加画像（最大10枚）
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenAdditionalImagesPicker}
              disabled={isPending || imageUrlsList.length >= 10}
              aria-invalid={fields.imageUrls.errors ? true : undefined}
              aria-describedby={
                fields.imageUrls.errors ? fields.imageUrls.errorId : undefined
              }
            >
              <IconPhotoPlus aria-hidden="true" className="mr-2 h-4 w-4" />
              画像を追加
            </Button>
            {imageUrlsList.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  {imageUrlsList.length} / 10 枚選択中 ・
                  ドラッグ&ドロップで順序を変更できます
                </p>
                <DndContext
                  id={dndContextId}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onImageDragEnd}
                >
                  <SortableContext
                    items={imageUrlsList.map((item) => item.key ?? "")}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="mt-2 space-y-2">
                      {imageUrlsList.map((item, index) => {
                        const itemFields = item.getFieldset();
                        const url = conformFieldText(itemFields.url.value);
                        return (
                          <SortableImageItem
                            key={item.key}
                            id={item.key ?? ""}
                            url={url}
                            index={index}
                            disabled={isPending}
                            onRemove={() => {
                              form.remove({
                                name: fields.imageUrls.name,
                                index,
                              });
                            }}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
            {fields.imageUrls.errors && (
              <p
                id={fields.imageUrls.errorId}
                className="text-sm text-destructive"
              >
                {fields.imageUrls.errors.join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>設備・サービス</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label>この拠点の設備</Label>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
                <div key={attr.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`amenity-${attr.key}`}
                    checked={amenities[attr.key] ?? false}
                    onCheckedChange={(checked) => {
                      setAmenities((prev) => ({
                        ...prev,
                        [attr.key]: checked === true,
                      }));
                    }}
                    disabled={isPending}
                  />
                  <Label
                    htmlFor={`amenity-${attr.key}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {attr.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              拠点ごとに利用可能な設備を選択してください。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公開設定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center gap-4">
            <Switch
              id="location-isPublished"
              checked={isPublished}
              onCheckedChange={setIsPublished}
              disabled={isPending}
            />
            <div>
              <Label
                htmlFor="location-isPublished"
                className="text-base font-medium"
              >
                {getPublishLabel(isPublished)}
              </Label>
              <p className="text-sm text-muted-foreground">
                {isPublished
                  ? "この場所は公開ページに表示されます"
                  : "この場所は公開ページに表示されません"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
