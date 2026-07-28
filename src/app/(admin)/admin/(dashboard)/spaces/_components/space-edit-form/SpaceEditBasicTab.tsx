"use client";

import type { FieldMetadata } from "@conform-to/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsContent,
} from "@/admin/components/ui";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import type { SpaceEditLocationOption } from "./types";

type SpaceEditBasicTabProps = {
  space: SpaceWithStats | undefined;
  isPending: boolean;
  name: string;
  onNameChange: (value: string) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  descriptionJson: string;
  onDescriptionJsonChange: (value: string) => void;
  editorResetKey: number;
  autoSaveKey: string;
  locationId: string;
  onLocationIdChange: (value: string) => void;
  addressDetail: string;
  onAddressDetailChange: (value: string) => void;
  capacity: string;
  onCapacityChange: (value: string) => void;
  area: string;
  onAreaChange: (value: string) => void;
  availableLocations: readonly SpaceEditLocationOption[];
  fields: {
    name: FieldMetadata<unknown>;
    slug: FieldMetadata<unknown>;
    descriptionJson: FieldMetadata<unknown>;
    locationId: FieldMetadata<unknown>;
    addressDetail: FieldMetadata<unknown>;
    capacity: FieldMetadata<unknown>;
    area: FieldMetadata<unknown>;
  };
};

export function SpaceEditBasicTab({
  space,
  isPending,
  name,
  onNameChange,
  slug,
  onSlugChange,
  descriptionJson,
  onDescriptionJsonChange,
  editorResetKey,
  autoSaveKey,
  locationId,
  onLocationIdChange,
  addressDetail,
  onAddressDetailChange,
  capacity,
  onCapacityChange,
  area,
  onAreaChange,
  availableLocations,
  fields,
}: SpaceEditBasicTabProps) {
  return (
    <TabsContent
      value="basic"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="space-name">スペース名 *</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例: 会議室A"
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
            <Label htmlFor="space-slug">スラッグ *</Label>
            <Input
              id="space-slug"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="例: meeting-room-a"
              disabled={isPending}
              aria-invalid={fields.slug.errors ? true : undefined}
              aria-describedby={
                fields.slug.errors ? fields.slug.errorId : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              URLに使用されます（小文字英数字とハイフンのみ）
            </p>
            {fields.slug.errors && (
              <p id={fields.slug.errorId} className="text-sm text-destructive">
                {fields.slug.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label id="space-description-label" htmlFor="space-description">
              説明 *
            </Label>
            <div className="overflow-hidden rounded-lg border border-border">
              <LazyLexicalEditor
                key={`${space?.id ?? "new"}-${editorResetKey}`}
                contentJson={descriptionJson}
                onChange={onDescriptionJsonChange}
                height="560px"
                placeholder="スペースの説明を入力..."
                contentEditableId="space-description"
                ariaLabelledBy="space-description-label"
                ariaDescribedBy={
                  fields.descriptionJson.errors
                    ? fields.descriptionJson.errorId
                    : undefined
                }
                mediaUsage="SPACE"
                autoSaveKey={autoSaveKey}
              />
            </div>
            {fields.descriptionJson.errors && (
              <p
                id={fields.descriptionJson.errorId}
                className="text-sm text-destructive"
              >
                {fields.descriptionJson.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-locationId">拠点（建物）*</Label>
            {availableLocations.length === 0 ? (
              <p className="text-sm text-destructive">
                拠点が登録されていません。スペース管理の「場所」タブから先に拠点を作成してください。
              </p>
            ) : (
              <Select
                {...(locationId !== "" ? { value: locationId } : {})}
                onValueChange={onLocationIdChange}
                disabled={isPending}
              >
                <SelectTrigger
                  id="space-locationId"
                  aria-invalid={fields.locationId.errors ? true : undefined}
                  aria-describedby={
                    fields.locationId.errors
                      ? fields.locationId.errorId
                      : undefined
                  }
                >
                  <SelectValue placeholder="拠点を選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}（{loc.address}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {fields.locationId.errors && (
              <p
                id={fields.locationId.errorId}
                className="text-sm text-destructive"
              >
                {fields.locationId.errors.join(", ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              建物の住所は拠点マスタが正本です。号室やフロアは下の「所在地補足」に入力します。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-addressDetail">
              所在地補足（号室・フロア等）
            </Label>
            <Input
              id="space-addressDetail"
              value={addressDetail}
              onChange={(e) => onAddressDetailChange(e.target.value)}
              placeholder="例: 3F 会議室A（任意）"
              disabled={isPending}
              aria-invalid={fields.addressDetail.errors ? true : undefined}
              aria-describedby={
                fields.addressDetail.errors
                  ? fields.addressDetail.errorId
                  : undefined
              }
            />
            {fields.addressDetail.errors && (
              <p
                id={fields.addressDetail.errorId}
                className="text-sm text-destructive"
              >
                {fields.addressDetail.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-capacity">定員（人数）*</Label>
              <Input
                id="space-capacity"
                type="number"
                value={capacity}
                onChange={(e) => onCapacityChange(e.target.value)}
                placeholder="10"
                disabled={isPending}
                aria-invalid={fields.capacity.errors ? true : undefined}
                aria-describedby={
                  fields.capacity.errors ? fields.capacity.errorId : undefined
                }
              />
              {fields.capacity.errors && (
                <p
                  id={fields.capacity.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.capacity.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-area">面積（m²）</Label>
              <Input
                id="space-area"
                type="number"
                step="0.01"
                value={area}
                onChange={(e) => onAreaChange(e.target.value)}
                placeholder="50"
                disabled={isPending}
                aria-invalid={fields.area.errors ? true : undefined}
                aria-describedby={
                  fields.area.errors ? fields.area.errorId : undefined
                }
              />
              {fields.area.errors && (
                <p
                  id={fields.area.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.area.errors.join(", ")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
