"use client";

import type { ReactElement } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import {
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { eventFormSchema } from "@/shared/lib/validations/event";
import type { z } from "zod";

// =============================================================================
// Types
// =============================================================================

type FormValues = z.infer<typeof eventFormSchema>;

type EventScheduleFieldsProps = {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  isPending: boolean;
};

// =============================================================================
// Component
// =============================================================================

export function EventScheduleFields({
  register,
  errors,
  isPending,
}: EventScheduleFieldsProps): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>日程・定員・料金</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label htmlFor="startTime">開始日時</Label>
            <Input
              id="startTime"
              type="datetime-local"
              {...register("startTime")}
              disabled={isPending}
            />
            {errors.startTime && (
              <p className="text-sm text-destructive mt-1">
                {errors.startTime.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="endTime">終了日時</Label>
            <Input
              id="endTime"
              type="datetime-local"
              {...register("endTime")}
              disabled={isPending}
            />
            {errors.endTime && (
              <p className="text-sm text-destructive mt-1">
                {errors.endTime.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div>
            <Label htmlFor="capacity">定員</Label>
            <Input
              id="capacity"
              type="number"
              {...register("capacity", { valueAsNumber: true })}
              disabled={isPending}
            />
            {errors.capacity && (
              <p className="text-sm text-destructive mt-1">
                {errors.capacity.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="price">料金</Label>
            <Input
              id="price"
              type="number"
              {...register("price", { valueAsNumber: true })}
              disabled={isPending}
            />
            {errors.price && (
              <p className="text-sm text-destructive mt-1">
                {errors.price.message}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
