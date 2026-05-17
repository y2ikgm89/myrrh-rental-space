"use client";

/**
 * スタッフ（User）作成・編集フォーム
 *
 * への clean break 移行。`updateUser` は `user.id` を bind で部分適用。
 *
 * ロール選択肢は `editableRoles` prop に従う（呼び出し側が階層から決定）。
 * サーバー側でも `canInviteRole()` / `canModifyUser()` で defense-in-depth チェック。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
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
import { createUser, updateUser } from "@/admin/actions/user";
import {
  createUserSchema,
  updateUserSchema,
} from "@/shared/lib/validations/user";
import type { UserData } from "@/shared/domain/users/types";
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

  const schema = isEdit ? updateUserSchema : createUserSchema;
  const boundAction = isEdit ? updateUser.bind(null, user.id) : createUser;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `user-edit-${user.id}` : "user-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: isEdit
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
  });

  const roleControl = useInputControl(fields.role);
  const currentRole =
    roleControl.value && isDashboardRoleValue(roleControl.value)
      ? roleControl.value
      : defaultRole;

  // 対象ユーザーが自分より上位の場合、ロール変更は不可（UI でも読み取り専用化）
  const roleLocked =
    isEdit &&
    currentUserRole !== undefined &&
    !editableDashboardRoles.includes(currentUserRole);

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "ユーザーを更新しました" : "ユーザーを作成しました",
      );
      router.push(isEdit ? `/admin/staff/${user.id}` : "/admin/staff");
      router.refresh();
    }
  }, [lastResult, router, isEdit, user]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fields.name.id}>名前 *</Label>
          <Input
            {...getInputProps(fields.name, { type: "text" })}
            autoComplete="name"
            placeholder="山田 太郎"
            disabled={isPending}
          />
          {fields.name.errors && (
            <p
              id={fields.name.errorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {fields.name.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fields.email.id}>メールアドレス *</Label>
          <Input
            {...getInputProps(fields.email, { type: "email" })}
            autoComplete="email"
            placeholder="example@example.com"
            disabled={isPending}
          />
          {fields.email.errors && (
            <p
              id={fields.email.errorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {fields.email.errors.join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fields.password.id}>
            パスワード {isEdit ? "(変更する場合のみ入力)" : "*"}
          </Label>
          <Input
            {...getInputProps(fields.password, { type: "password" })}
            autoComplete="new-password"
            placeholder={isEdit ? "変更しない場合は空欄" : "8文字以上"}
            disabled={isPending}
          />
          {fields.password.errors && (
            <p
              id={fields.password.errorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {fields.password.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fields.role.id}>ロール *</Label>
          <Select
            value={currentRole}
            onValueChange={(value) => {
              if (isDashboardRoleValue(value)) {
                roleControl.change(value);
              }
            }}
            disabled={roleLocked || isPending}
          >
            <SelectTrigger
              id={fields.role.id}
              aria-describedby={`${fields.role.id}-description`}
              onBlur={roleControl.blur}
            >
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
          <input type="hidden" name={fields.role.name} value={currentRole} />
          <p
            id={`${fields.role.id}-description`}
            className="text-xs text-muted-foreground"
          >
            {roleLocked
              ? "このユーザーのロールを変更する権限がありません"
              : ROLE_DESCRIPTIONS[currentRole]}
          </p>
          {fields.role.errors && (
            <p role="alert" className="text-xs text-destructive">
              {fields.role.errors.join(", ")}
            </p>
          )}
        </div>
      </div>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}

      <div className="flex gap-4">
        <SubmitButton
          isPending={isPending}
          label={isEdit ? "更新" : "作成"}
          pendingLabel={isEdit ? "更新中..." : "作成中..."}
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
