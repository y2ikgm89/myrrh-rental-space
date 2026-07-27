"use client";

import type { FieldMetadata } from "@conform-to/react";
import { IconX } from "@tabler/icons-react";
import {
  Button,
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
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import { SELECT_NONE_VALUE } from "./constants";
import type { FacilityItem, SpaceEditCategoryOption } from "./types";
import { SpaceSmartLockDeviceCard } from "./SpaceSmartLockDeviceCard";

type SpaceEditDetailsTabProps = {
  isEdit: boolean;
  space: SpaceWithStats | undefined;
  isPending: boolean;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  facilities: readonly FacilityItem[];
  newFacility: string;
  onNewFacilityChange: (value: string) => void;
  newFacilityIconName: string;
  onNewFacilityIconNameChange: (value: string) => void;
  onAddFacility: () => void;
  onRemoveFacility: (key: string) => void;
  availableCategories: readonly SpaceEditCategoryOption[];
  availableSmartLockDevices: readonly SmartLockDeviceData[];
  fields: {
    categoryId: FieldMetadata<unknown>;
    facilities: FieldMetadata<unknown>;
  };
};

export function SpaceEditDetailsTab({
  isEdit,
  space,
  isPending,
  categoryId,
  onCategoryIdChange,
  facilities,
  newFacility,
  onNewFacilityChange,
  newFacilityIconName,
  onNewFacilityIconNameChange,
  onAddFacility,
  onRemoveFacility,
  availableCategories,
  availableSmartLockDevices,
  fields,
}: SpaceEditDetailsTabProps) {
  return (
    <TabsContent
      value="details"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <div className="space-y-6">
        {availableCategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>カテゴリー</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="space-categoryId">カテゴリー（用途）</Label>
                <Select
                  value={categoryId === "" ? SELECT_NONE_VALUE : categoryId}
                  onValueChange={(value) =>
                    onCategoryIdChange(value === SELECT_NONE_VALUE ? "" : value)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="space-categoryId"
                    aria-invalid={fields.categoryId.errors ? true : undefined}
                    aria-describedby={
                      fields.categoryId.errors
                        ? fields.categoryId.errorId
                        : undefined
                    }
                  >
                    <SelectValue placeholder="カテゴリーを選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon && <span className="mr-1">{cat.icon}</span>}
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.categoryId.errors && (
                  <p
                    id={fields.categoryId.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.categoryId.errors.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>設備・アメニティ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="space-new-facility-name">設備名</Label>
                <Input
                  id="space-new-facility-name"
                  value={newFacility}
                  onChange={(e) => onNewFacilityChange(e.target.value)}
                  placeholder="例: WiFi、プロジェクター"
                  disabled={isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddFacility();
                    }
                  }}
                  aria-invalid={fields.facilities.errors ? true : undefined}
                  aria-describedby={
                    fields.facilities.errors
                      ? fields.facilities.errorId
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>アイコン (任意)</Label>
                <IconPickerField
                  value={newFacilityIconName}
                  onChange={onNewFacilityIconNameChange}
                  disabled={isPending}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onAddFacility}
                disabled={isPending}
              >
                追加
              </Button>
            </div>
            {facilities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {facilities.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm"
                  >
                    {item.iconName ? (
                      <CuratedIcon
                        name={item.iconName}
                        className="h-3.5 w-3.5"
                      />
                    ) : null}
                    {item.name}
                    <button
                      type="button"
                      onClick={() => onRemoveFacility(item.key)}
                      disabled={isPending}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`${item.name}を削除`}
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {fields.facilities.errors && (
              <p
                id={fields.facilities.errorId}
                className="text-sm text-destructive"
              >
                {fields.facilities.errors.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>

        {isEdit && space && (
          <SpaceSmartLockDeviceCard
            spaceId={space.id}
            initialDeviceId={space.smartLockDeviceId}
            availableDevices={availableSmartLockDevices}
          />
        )}
      </div>
    </TabsContent>
  );
}
