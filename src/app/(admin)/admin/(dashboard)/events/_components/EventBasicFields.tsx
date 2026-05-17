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
} from "@/admin/components/ui";
import type { EventFormFields } from "./event-form-fields-types";

type EventBasicFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
};

export function EventBasicFields({
  fields,
  isPending,
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
      </CardContent>
    </Card>
  );
}
