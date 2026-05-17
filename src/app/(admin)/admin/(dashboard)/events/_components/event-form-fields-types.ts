import type { FieldMetadata } from "@conform-to/react";
import type { z } from "zod";
import type { eventFormSchema } from "./event-form-schema";

/**
 * EventForm の conform `fields` 型を再利用するための shared 型 SSoT。
 *
 * `useForm<z.input<typeof eventFormSchema>>()[1]` が返す各 field の型を
 * sub-component に props で渡すために named-pick できるよう Record 化する。
 *
 * Phase 1 Task 8.5 — EventForm + 子 4 component conform 移行
 */

type EventFormValues = z.input<typeof eventFormSchema>;

export type EventFormFields = {
  readonly [K in keyof EventFormValues]-?: FieldMetadata<
    EventFormValues[K],
    EventFormValues,
    string[]
  >;
};
