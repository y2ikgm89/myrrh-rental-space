"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SubmissionResult } from "@conform-to/react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PublishSwitch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  TRANSFER_ACCOUNT_TYPE,
  TRANSFER_ACCOUNT_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { transferAccountFormSchema } from "@/shared/lib/validations/transfer-account";
import type { TransferAccountRecord } from "@/shared/domain/settings/transfer-account-queries";
import type { Serialized } from "@/shared/lib/serialize";
import {
  createTransferAccount,
  deleteTransferAccount,
  toggleTransferAccountActive,
  updateTransferAccount,
} from "@/admin/actions/settings/transfer-accounts";

type Props = {
  accounts: Serialized<TransferAccountRecord>[];
};

type FormMode = "create" | "edit";

function TransferAccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FormMode;
  account: Serialized<TransferAccountRecord> | null;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const action =
    mode === "create"
      ? createTransferAccount
      : updateTransferAccount.bind(null, account?.id ?? "");

  const [lastResult, formAction, isPending] = useActionState<
    SubmissionResult | undefined,
    FormData
  >(action, undefined);

  const [accountType, setAccountType] = useState<string>(
    account?.accountType ?? TRANSFER_ACCOUNT_TYPE.ORDINARY,
  );
  const [isActive, setIsActive] = useState<boolean>(account?.isActive ?? true);

  const [form, fields] = useForm({
    lastResult,
    defaultValue: {
      label: account?.label ?? "",
      bankName: account?.bankName ?? "",
      branchName: account?.branchName ?? "",
      accountType: account?.accountType ?? TRANSFER_ACCOUNT_TYPE.ORDINARY,
      accountNumber: account?.accountNumber ?? "",
      accountHolderName: account?.accountHolderName ?? "",
      note: account?.note ?? "",
      sortOrder: String(account?.sortOrder ?? 0),
      isActive: account?.isActive ?? true,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: transferAccountFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  useEffect(() => {
    if (lastResult?.status === "success") {
      toast.success(
        isEdit ? "振込先口座を更新しました" : "振込先口座を追加しました",
      );
      onOpenChange(false);
      router.refresh();
    }
  }, [lastResult, isEdit, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "振込先口座を編集" : "振込先口座を追加"}
          </DialogTitle>
          <DialogDescription>
            オンライン決済 OFF かつ未払いの予約・イベント申込に表示されます。
          </DialogDescription>
        </DialogHeader>
        <form {...getFormProps(form)} action={formAction} className="space-y-4">
          <input
            type="hidden"
            name={fields.accountType.name}
            value={accountType}
          />
          <input
            type="hidden"
            name={fields.isActive.name}
            value={isActive ? "true" : "false"}
          />

          <div className="space-y-2">
            <Label htmlFor={fields.label.id}>管理用表示名</Label>
            <Input {...getInputProps(fields.label, { type: "text" })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.bankName.id}>金融機関名</Label>
              <Input {...getInputProps(fields.bankName, { type: "text" })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.branchName.id}>支店名</Label>
              <Input {...getInputProps(fields.branchName, { type: "text" })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.accountType.id}>口座種別</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger id={fields.accountType.id}>
                  <SelectValue placeholder="口座種別" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TRANSFER_ACCOUNT_TYPE).map((type) => (
                    <SelectItem key={type} value={type}>
                      {TRANSFER_ACCOUNT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.accountNumber.id}>口座番号</Label>
              <Input
                {...getInputProps(fields.accountNumber, { type: "text" })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fields.accountHolderName.id}>
              口座名義（カナ）
            </Label>
            <Input
              {...getInputProps(fields.accountHolderName, { type: "text" })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fields.note.id}>顧客向け補足（任意）</Label>
            <Textarea
              {...getInputProps(fields.note, { type: "text" })}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fields.sortOrder.id}>表示順</Label>
            <Input {...getInputProps(fields.sortOrder, { type: "number" })} />
          </div>
          <div className="flex items-start gap-3">
            <Switch
              id={fields.isActive.id}
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isPending}
            />
            <Label htmlFor={fields.isActive.id}>有効にする</Label>
          </div>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            form={form.id}
            isPending={isPending}
            label={isEdit ? "保存" : "追加"}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransferAccountRegistry({ accounts }: Props) {
  const router = useRouter();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<FormMode>("create");
  const [editingAccount, setEditingAccount] =
    useState<Serialized<TransferAccountRecord> | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleToggleActive = (
    accountId: string,
    checked: boolean,
  ): Promise<MutationResult<{ id: string; isActive: boolean }>> => {
    return toggleTransferAccountActive(accountId, checked);
  };

  const handleDelete = () => {
    if (!deleteTargetId) return;
    startDeleteTransition(async () => {
      const result = await deleteTransferAccount(deleteTargetId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("振込先口座を削除しました");
      setDeleteTargetId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          有効な口座を表示順の昇順ですべて表示します。
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setDialogMode("create");
            setEditingAccount(null);
            setDialogOpen(true);
          }}
        >
          <IconPlus className="size-4" />
          口座を追加
        </Button>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          振込先口座が登録されていません
        </p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{account.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.bankName} {account.branchName} /{" "}
                  {TRANSFER_ACCOUNT_TYPE_LABELS[account.accountType]}{" "}
                  {account.accountNumber}
                </p>
                <p className="text-sm text-muted-foreground">
                  表示順: {account.sortOrder}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PublishSwitch
                  id={account.id}
                  isPublished={account.isActive}
                  onToggle={handleToggleActive}
                  resourceLabel={`${account.label} の有効状態`}
                  label={{ published: "有効", unpublished: "無効" }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setDialogMode("edit");
                    setEditingAccount(account);
                    setDialogOpen(true);
                  }}
                >
                  <IconPencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isDeleting}
                  onClick={() => setDeleteTargetId(account.id)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TransferAccountFormDialog
        key={`${dialogMode}-${editingAccount?.id ?? "new"}-${dialogOpen}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        account={editingAccount}
      />

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="振込先口座を削除"
        description="この口座を削除します。よろしいですか？"
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </div>
  );
}
