"use client";

import type { ReactElement } from "react";
import { getInputProps } from "@conform-to/react";
import {
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { EventFormFields } from "./event-form-fields-types";

type CategoryOption = { id: string; name: string };

type EventBasicFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
  categories: CategoryOption[];
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
};

export function EventBasicFields({
  fields,
  isPending,
  categories,
  categoryId,
  onCategoryChange,
}: EventBasicFieldsProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor={fields.title.id}>タイトル</Label>
          <Input
            {...getInputProps(fields.title, { type: "text" })}
            disabled={isPending}
          />
          {fields.title.errors && (
            <p
              id={fields.title.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.title.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={fields.slug.id}>スラッグ</Label>
          <Input
            {...getInputProps(fields.slug, { type: "text" })}
            disabled={isPending}
          />
          {fields.slug.errors && (
            <p
              id={fields.slug.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.slug.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="event-categoryId">カテゴリー</Label>
          {categories.length === 0 ? (
            <p className="text-sm text-destructive">
              カテゴリーが登録されていません。イベント管理の「カテゴリー管理」から先にカテゴリーを作成してください。
            </p>
          ) : (
            <Select
              {...(categoryId !== "" ? { value: categoryId } : {})}
              onValueChange={onCategoryChange}
              disabled={isPending}
            >
              <SelectTrigger
                id="event-categoryId"
                aria-invalid={fields.categoryId.errors ? true : undefined}
                aria-describedby={
                  fields.categoryId.errors
                    ? fields.categoryId.errorId
                    : undefined
                }
              >
                <SelectValue placeholder="カテゴリーを選択" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fields.categoryId.errors && (
            <p
              id={fields.categoryId.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.categoryId.errors.join(", ")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
