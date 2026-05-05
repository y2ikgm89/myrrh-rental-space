"use client";

import { IconX } from "@tabler/icons-react";
import type {
  Control,
  FieldArrayWithId,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
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
import type { SpaceEditFormData } from "../schema";
import { SELECT_NONE_VALUE, type SpaceEditCategoryOption } from "../types";

type SpaceEditDetailsTabPanelProps = {
  control: Control<SpaceEditFormData>;
  setValue: UseFormSetValue<SpaceEditFormData>;
  isPending: boolean;
  availableCategories: SpaceEditCategoryOption[];
  newFacility: string;
  onNewFacilityChange: (value: string) => void;
  onAddFacility: () => void;
  facilityFields: FieldArrayWithId<SpaceEditFormData, "facilities", "id">[];
  onRemoveFacility: (index: number) => void;
};

export function SpaceEditDetailsTabPanel({
  control,
  setValue,
  isPending,
  availableCategories,
  newFacility,
  onNewFacilityChange,
  onAddFacility,
  facilityFields,
  onRemoveFacility,
}: SpaceEditDetailsTabPanelProps) {
  const categoryId = useWatch({ control, name: "categoryId" });

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
                <Label htmlFor="categoryId">カテゴリー（用途）</Label>
                <Select
                  value={categoryId ?? SELECT_NONE_VALUE}
                  onValueChange={(value) =>
                    setValue(
                      "categoryId",
                      value === SELECT_NONE_VALUE ? undefined : value,
                      { shouldDirty: true },
                    )
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="categoryId">
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
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>設備・アメニティ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
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
              />
              <Button
                type="button"
                variant="outline"
                onClick={onAddFacility}
                disabled={isPending}
              >
                追加
              </Button>
            </div>
            {facilityFields.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {facilityFields.map((field, index) => (
                  <span
                    key={field.id}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                  >
                    {field.value}
                    <button
                      type="button"
                      onClick={() => onRemoveFacility(index)}
                      disabled={isPending}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`${field.value}を削除`}
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
