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

type EventBasicFieldsProps = {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  isPending: boolean;
};

// =============================================================================
// Component
// =============================================================================

export function EventBasicFields({
  register,
  errors,
  isPending,
}: EventBasicFieldsProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="title">タイトル</Label>
          <Input id="title" {...register("title")} disabled={isPending} />
          {errors.title && (
            <p className="text-sm text-destructive mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="slug">スラッグ</Label>
          <Input id="slug" {...register("slug")} disabled={isPending} />
          {errors.slug && (
            <p className="text-sm text-destructive mt-1">
              {errors.slug.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
