"use client";

/**
 * スタッフ（User）作成・編集フォーム
 *
 * ロール選択肢は `editableRoles` prop に従う（呼び出し側が階層から決定）。
 * サーバー側でも `canInviteRole()` / `canModifyUser()` で defense-in-depth チェック。
 */

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
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  DASHBOARD_ROLES,
  isDashboardRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type DashboardRole,
} from "@/shared/lib/admin-roles";

const DASHBOARD_ROLE_SET = new Set<string>(DASHBOARD_ROLES);

function isDashboardRoleValue(value: string): value is DashboardRole {
  return DASHBOARD_ROLE_SET.has(value);
}

type Props = (
  | { mode: "create"; user?: never }
  | { mode: "edit"; user: UserData }
) & {
  /** 現在ユーザーが付与可能なロール（`getInvitableRoles(currentUser.role)` で取得） */
  editableRoles: readonly Role[];
};

export function UserForm({ mode, user, editableRoles }: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";

  // 対象ユーザーの現在ロールが DashboardRole でない場合（データ異常）は空ロール扱い
  const currentUserRole: DashboardRole | undefined =
    isEdit && isDashboardRole(user.role) ? user.role : undefined;

  // editableRoles を DashboardRole に狭窄（schema 層で既に保証されているが型で再確認）
  const editableDashboardRoles: readonly DashboardRole[] =
    editableRoles.filter(isDashboardRole);

  // 編集時は対象ユーザーの現在ロールも選択肢に含める（editableRoles に含まれない場合の表示維持）
  const availableRoles: readonly DashboardRole[] =
    currentUserRole !== undefined &&
    !editableDashboardRoles.includes(currentUserRole)
      ? [currentUserRole, ...editableDashboardRoles]
      : editableDashboardRoles;

  const defaultRole: DashboardRole =
    currentUserRole ??
    (editableDashboardRoles.includes(Role.EDITOR)
      ? Role.EDITOR
      : (editableDashboardRoles[0] ?? Role.VIEWER));

  const { form, isPending, onSubmit } = useFormAction(
    isEdit ? updateUserSchema : createUserSchema,
    async (data): Promise<MutationResult<null>> => {
      if (isEdit) {
        return updateUser(user.id, {
          email: data.email,
          name: data.name,
          role: data.role,
          password: data.password || undefined,
        });
      }
      const result = await createUser({
        email: data.email,
        name: data.name,
        role: data.role,
        password: data.password ?? "",
      });
      return isMutationError(result) ? result : null;
    },
    {
      redirectTo: isEdit ? `/admin/staff/${user.id}` : "/admin/staff",
      refresh: true,
      defaultValues: isEdit
        ? {
            email: user.email,
            password: "",
            name: user.name || "",
            role: defaultRole,
          }
        : {
            email: "",
            password: "",
            name: "",
            role: defaultRole,
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
  // 対象ユーザーが自分より上位の場合、ロール変更は不可（UI でも読み取り専用化）
  const roleLocked =
    isEdit &&
    currentUserRole !== undefined &&
    !editableDashboardRoles.includes(currentUserRole);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">名前 *</Label>
          <Input
            id="name"
            autoComplete="name"
            {...register("name")}
            placeholder="山田 太郎"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name && (
            <p
              id="name-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            placeholder="example@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="text-xs text-destructive"
            >
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
            autoComplete={isEdit ? "new-password" : "new-password"}
            {...register("password")}
            placeholder={isEdit ? "変更しない場合は空欄" : "8文字以上"}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && (
            <p
              id="password-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">ロール *</Label>
          <Select
            value={currentRole}
            onValueChange={(value) => {
              if (isDashboardRoleValue(value)) {
                setValue("role", value);
              }
            }}
            disabled={roleLocked}
          >
            <SelectTrigger id="role" aria-describedby="role-description">
              <SelectValue placeholder="ロールを選択" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((role) => (
                <SelectItem
                  key={role}
                  value={role}
                  disabled={roleLocked && role !== currentUserRole}
                >
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="role-description" className="text-xs text-muted-foreground">
            {roleLocked
              ? "このユーザーのロールを変更する権限がありません"
              : ROLE_DESCRIPTIONS[currentRole]}
          </p>
          {errors.role && (
            <p role="alert" className="text-xs text-destructive">
              {errors.role.message}
            </p>
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
