"use client";

/**
 * スタッフ招待フォーム
 *
 * メールアドレスを入力して招待メールを送信
 * スタッフ自身がパスワードを設定するフロー
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/admin/components/ui/button";
import { SubmitButton } from "@/admin/components/ui";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { useFormAction } from "@/admin/hooks";
import { sendInvitation } from "@/admin/actions/staff-invitation";
import {
  DASHBOARD_ROLES,
  type DashboardRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_INVITABLE_ROLES,
} from "@/shared/lib/admin-roles";

const inviteSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().max(100).optional(),
  role: z.enum(DASHBOARD_ROLES),
});

export function InviteForm() {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const { form, isPending, onSubmit } = useFormAction(
    inviteSchema,
    async (data) =>
      sendInvitation({
        email: data.email,
        name: data.name || undefined,
        role: data.role,
      }),
    {
      successMessage: "招待メールを送信しました",
      defaultValues: {
        email: "",
        name: "",
        role: "EDITOR",
      },
      onSuccess: () => {
        setSuccess(true);
        form.reset();
        // 3秒後にスタッフ一覧へ戻る
        setTimeout(() => {
          router.push("/admin/staff");
          router.refresh();
        }, 3000);
      },
    },
  );

  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  const currentRole = useWatch({ control, name: "role" });

  if (success) {
    return (
      <div className="rounded-md bg-success/10 p-6 text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success/20 mb-4">
          <svg
            className="h-6 w-6 text-success"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-success">
          招待メールを送信しました
        </h3>
        <p className="mt-2 text-sm text-success/80">
          スタッフにメールが届き、パスワードを設定するとログインできるようになります。
        </p>
        <p className="mt-4 text-xs text-success">スタッフ一覧に戻ります...</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-md bg-info/10 p-4 text-sm text-info">
        <p className="font-medium">招待フローについて</p>
        <p className="mt-1">
          メールアドレスを入力して招待を送信すると、スタッフ宛に招待メールが届きます。
          スタッフは自分でパスワードを設定してログインできるようになります。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="staff@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">名前（任意）</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="山田 太郎"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : "name-hint"}
          />
          <p id="name-hint" className="text-xs text-muted-foreground">
            未入力の場合、メールアドレスから自動生成されます
          </p>
          {errors.name && (
            <p id="name-error" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">ロール *</Label>
        <Select
          value={currentRole}
          onValueChange={(value: DashboardRole) => setValue("role", value)}
        >
          <SelectTrigger className="w-full md:w-1/2">
            <SelectValue placeholder="ロールを選択" />
          </SelectTrigger>
          <SelectContent>
            {STAFF_INVITABLE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {ROLE_DESCRIPTIONS[currentRole]}
        </p>
        {errors.role && (
          <p className="text-xs text-destructive">{errors.role.message}</p>
        )}
      </div>

      <div className="flex gap-4">
        <SubmitButton
          isPending={isPending}
          label="招待メールを送信"
          pendingLabel="送信中..."
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
