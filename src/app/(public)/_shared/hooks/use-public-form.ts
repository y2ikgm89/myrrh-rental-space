"use client";

import { useTransition } from "react";
import {
  useForm,
  type FieldValues,
  type DefaultValues,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

type UsePublicFormOptions<TInput extends FieldValues> = {
  defaultValues?: DefaultValues<TInput>;
};

export function usePublicForm<TInput extends FieldValues, TOutput = null>(
  schema: StandardSchemaV1<TInput, TInput>,
  action: (data: TInput) => Promise<MutationResult<TOutput>>,
  options?: UsePublicFormOptions<TInput>,
) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<TInput>({
    resolver: standardSchemaResolver(schema),
    ...(options?.defaultValues !== undefined && {
      defaultValues: options.defaultValues,
    }),
  });

  const onSubmit = form.handleSubmit((data: TInput) => {
    startTransition(async () => {
      const result = await action(data);

      if (isMutationError(result)) {
        if (result.fieldErrors) {
          const currentValues = form.getValues();
          for (const [field, errors] of Object.entries(result.fieldErrors)) {
            if (errors && errors.length > 0 && field in currentValues) {
              const firstError = errors[0];
              form.setError(field as Path<TInput>, {
                type: "server",
                ...(firstError !== undefined && { message: firstError }),
              });
            }
          }
        }
      }
    });
  });

  return { form, isPending, onSubmit };
}
