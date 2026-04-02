"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
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
import { createUser, updateUser } from "@/admin/actions/user";
import {
  createUserSchema,
  updateUserSchema,
} from "@/shared/lib/validations/user";
import type { UserData } from "@/shared/domain/users/types";
import { Role } from "@generated/prisma/enums";
import { keysOf } from "@/shared/lib/serialize";

// ロールラベル（クライアント用ローカル定義）
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "スーパー管理者",
  ADMIN: "管理者",
  EDITOR: "編集者",
  VIEWER: "閲覧者",
  USER: "ユーザー",
  CUSTOMER: "顧客",
};

type Props =
  | { mode: "create"; user?: never }
  | { mode: "edit"; user: UserData };

export function UserForm({ mode, user }: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const { form, isPending, onSubmit } = useFormAction(
    isEdit ? updateUserSchema : createUserSchema,
    async (data) => {
      if (isEdit) {
        return updateUser(user.id, {
          email: data.email,
          name: data.name,
          role: data.role,
          password: data.password || undefined,
        });
      }
      // createUser パスでは createUserSchema で検証済み
      return createUser({
        email: data.email,
        name: data.name,
        role: data.role,
        password: data.password ?? "",
      });
    },
    {
      redirectTo: isEdit ? `/admin/staff/${user.id}` : "/admin/staff",
      refresh: true,
      defaultValues: isEdit
        ? {
            email: user.email,
            password: "",
            name: user.name || "",
            role: user.role,
          }
        : {
            email: "",
            password: "",
            name: "",
            role: "USER",
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">名前 *</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="山田 太郎"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="example@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">
            パスワード {isEdit ? "(変更する場合のみ入力)" : "*"}
          </Label>
          <Input
            id="password"
            type="password"
            {...register("password")}
            placeholder={isEdit ? "変更しない場合は空欄" : "8文字以上"}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">ロール *</Label>
          <Select
            value={currentRole}
            onValueChange={(value: Role) => setValue("role", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="ロールを選択" />
            </SelectTrigger>
            <SelectContent>
              {keysOf(ROLE_LABELS).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {currentRole === "SUPER_ADMIN" &&
              "システム全体の管理権限（ユーザー管理、監査ログ含む）"}
            {currentRole === "ADMIN" &&
              "コンテンツ管理全般（ユーザー管理除く）"}
            {currentRole === "EDITOR" && "割り当てられたページのみ編集可能"}
            {currentRole === "VIEWER" && "閲覧のみ（編集不可）"}
            {currentRole === "USER" && "公開ユーザー（管理画面アクセス不可）"}
          </p>
          {errors.role && (
            <p className="text-xs text-destructive">{errors.role.message}</p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <SubmitButton
          isPending={isPending}
          label={isEdit ? "更新" : "作成"}
          pendingLabel={isEdit ? "更新中..." : "作成中..."}
          {...(isEdit && { disabled: !form.formState.isDirty })}
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
