"use client";

import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateEmailTemplate } from "@/admin/actions/email-template";
import type { EmailTemplate } from "@/shared/domain/email-templates/types";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";
import { emailTemplateFormSchema } from "@/shared/lib/validations/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import { TemplatePreview } from "./TemplatePreview";
import { TestSendButton } from "./TestSendButton";
import { VariableHelpPanel } from "./VariableHelpPanel";

type Props = {
  type: EmailTemplateType;
  template: EmailTemplate;
  variables: readonly TemplateVariable[];
};

export function EmailTemplateForm({ type, template, variables }: Props) {
  const { form, isPending, onSubmit } = useFormAction(
    emailTemplateFormSchema,
    (data) => updateEmailTemplate(type, data),
    {
      refresh: true,
      successMessage: "テンプレートを保存しました",
      defaultValues: {
        subject: template.subject,
        greeting: template.greeting,
        intro: template.intro,
        outro: template.outro,
        enabled: template.enabled,
      },
    },
  );

  const watchedValues = useWatch({ control: form.control });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">テンプレート編集</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">メール送信を有効化</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        無効にするとこのテンプレートのメールは送信されません
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>件名</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>挨拶文</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="intro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>導入文</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={5} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>締め文</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={5} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <TestSendButton
                  type={type}
                  getValues={() => form.getValues()}
                  disabled={isPending}
                />
                <SubmitButton
                  isPending={isPending}
                  label="保存"
                  disabled={!form.formState.isDirty}
                />
              </div>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <VariableHelpPanel variables={variables} />
            <TemplatePreview
              variables={variables}
              subject={watchedValues.subject ?? ""}
              greeting={watchedValues.greeting ?? ""}
              intro={watchedValues.intro ?? ""}
              outro={watchedValues.outro ?? ""}
            />
          </div>
        </div>
      </form>
    </Form>
  );
}
