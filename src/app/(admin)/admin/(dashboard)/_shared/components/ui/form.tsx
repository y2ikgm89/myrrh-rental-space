'use client'

import type { ComponentPropsWithRef } from 'react'
import { createContext, use, useId } from 'react'
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/shared/lib/cn'
import { Label } from '@/admin/components/ui/label'

// =============================================================================
// Form（FormProvider の re-export）
// =============================================================================

const Form = FormProvider

// =============================================================================
// FormField（Controller + FormFieldContext）
// =============================================================================

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = createContext<FormFieldContextValue | undefined>(undefined)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext>
  )
}

// =============================================================================
// FormItem（useId によるIDコンテキスト）
// =============================================================================

type FormItemContextValue = {
  id: string
}

const FormItemContext = createContext<FormItemContextValue | undefined>(undefined)

function FormItem({ ref, className, ...props }: ComponentPropsWithRef<'div'>) {
  const id = useId()
  return (
    <FormItemContext value={{ id }}>
      <div ref={ref} className={cn('space-y-2', className)} {...props} />
    </FormItemContext>
  )
}

// =============================================================================
// useFormField（FormField + FormItem コンテキストの統合取得）
// =============================================================================

function useFormField() {
  const fieldContext = use(FormFieldContext)
  const itemContext = use(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>')
  }

  const fieldState = getFieldState(fieldContext.name, formState)
  const id = itemContext?.id ?? ''

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

// =============================================================================
// FormLabel（エラー時 text-destructive + 自動 htmlFor）
// =============================================================================

function FormLabel({ ref, className, ...props }: ComponentPropsWithRef<typeof Label>) {
  const { error, formItemId } = useFormField()
  return (
    <Label
      ref={ref}
      className={cn(error && 'text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

// =============================================================================
// FormControl（Slot で子要素に aria 属性をマージ）
// =============================================================================

function FormControl({ ref, ...props }: ComponentPropsWithRef<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
}

// =============================================================================
// FormDescription（ヒントテキスト）
// =============================================================================

function FormDescription({ ref, className, ...props }: ComponentPropsWithRef<'p'>) {
  const { formDescriptionId } = useFormField()
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

// =============================================================================
// FormMessage（エラーメッセージ）
// =============================================================================

function FormMessage({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<'p'>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? '') : children

  if (!body) return null

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-xs text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
}

// =============================================================================
// Exports
// =============================================================================

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormField,
  FormControl,
  FormDescription,
  FormMessage,
}
