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

type EventScheduleFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
};

export function EventScheduleFields({
  fields,
  isPending,
}: EventScheduleFieldsProps): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>日程・定員</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fields.startTime.id}>開始日時</Label>
            <Input
              {...getInputProps(fields.startTime, { type: "datetime-local" })}
              disabled={isPending}
            />
            {fields.startTime.errors && (
              <p
                id={fields.startTime.errorId}
                className="mt-1 text-sm text-destructive"
              >
                {fields.startTime.errors.join(", ")}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor={fields.endTime.id}>終了日時</Label>
            <Input
              {...getInputProps(fields.endTime, { type: "datetime-local" })}
              disabled={isPending}
            />
            {fields.endTime.errors && (
              <p
                id={fields.endTime.errorId}
                className="mt-1 text-sm text-destructive"
              >
                {fields.endTime.errors.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor={fields.capacity.id}>定員（全体）</Label>
          <Input
            {...getInputProps(fields.capacity, { type: "number" })}
            disabled={isPending}
          />
          {fields.capacity.errors && (
            <p
              id={fields.capacity.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.capacity.errors.join(", ")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
