"use client";

import { useTransition } from "react";
import { IconSend } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { sendTestEmail } from "@/admin/actions/email-template";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplateFormInput } from "@/shared/lib/validations/email-template";

type Props = {
  type: EmailTemplateType;
  getValues: () => EmailTemplateFormInput;
  disabled: boolean;
};

export function TestSendButton({ type, getValues, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    const values = getValues();
    startTransition(async () => {
      const result = await sendTestEmail({
        type,
        subject: values.subject,
        greeting: values.greeting,
        intro: values.intro,
        outro: values.outro,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("テストメールを送信しました");
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled || pending}
    >
      <IconSend className="mr-2 h-4 w-4" />
      {pending ? "送信中..." : "テスト送信"}
    </Button>
  );
}
