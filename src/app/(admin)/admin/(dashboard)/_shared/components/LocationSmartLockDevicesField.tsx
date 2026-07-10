"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SubmissionResult } from "@conform-to/react";
import { IconLock, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Input,
  Label,
  PublishSwitch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SubmitButton,
} from "@/admin/components/ui";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { SMART_LOCK_DEVICE_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidSmartLockDeviceType } from "@/shared/lib/validations/enums/guards";
import { smartLockDeviceFormSchema } from "@/admin/lib/validations/smart-lock-device";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";

type CreateSmartLockDeviceAction = (
  locationId: string,
  prev: SubmissionResult | undefined,
  formData: FormData,
) => Promise<SubmissionResult>;

type UpdateSmartLockDeviceAction = (
  locationId: string,
  deviceRowId: string,
  prev: SubmissionResult | undefined,
  formData: FormData,
) => Promise<SubmissionResult>;

type DeleteSmartLockDeviceAction = (
  locationId: string,
  deviceRowId: string,
) => Promise<MutationResult<{ id: string }>>;

type ToggleSmartLockDeviceActiveAction = (
  locationId: string,
  deviceRowId: string,
  isActive: boolean,
) => Promise<MutationResult<{ id: string; isActive: boolean }>>;

interface LocationSmartLockDevicesFieldProps {
  readonly locationId: string;
  readonly initialSmartLockDevices: readonly SmartLockDeviceData[];
  readonly createAction: CreateSmartLockDeviceAction;
  readonly updateAction: UpdateSmartLockDeviceAction;
  readonly deleteAction: DeleteSmartLockDeviceAction;
  readonly toggleActiveAction: ToggleSmartLockDeviceActiveAction;
}

const DEVICE_TYPE_VALUES: readonly SmartLockDeviceType[] = [
  SmartLockDeviceType.KEYPAD,
  SmartLockDeviceType.KEYPAD_TOUCH,
  SmartLockDeviceType.KEYPAD_VISION,
  SmartLockDeviceType.KEYPAD_VISION_PRO,
  SmartLockDeviceType.LOCK_VISION_PRO,
];

type DialogState =
  { mode: "create" } | { mode: "edit"; device: SmartLockDeviceData };

export function LocationSmartLockDevicesField({
  locationId,
  initialSmartLockDevices,
  createAction,
  updateAction,
  deleteAction,
  toggleActiveAction,
}: LocationSmartLockDevicesFieldProps) {
  const router = useRouter();
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (device: SmartLockDeviceData): void => {
    startDeleteTransition(async () => {
      const result = await deleteAction(locationId, device.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("スマートロックデバイスを削除しました");
      router.refresh();
    });
  };

  const handleToggleActive = (
    deviceRowId: string,
    checked: boolean,
  ): Promise<MutationResult<{ id: string; isActive: boolean }>> => {
    return toggleActiveAction(locationId, deviceRowId, checked);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          SwitchBot 製スマートロックデバイスを登録します（Keypad 系アクセサリ /
          Lock Vision Pro 単体）。入退室パスコードの発行は別画面で行います。
        </p>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setDialogState({ mode: "create" })}
        >
          <IconPlus className="mr-2 h-4 w-4" />
          デバイスを追加
        </Button>
      </div>

      {initialSmartLockDevices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
          <IconLock
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            登録済みのスマートロックデバイスはありません
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {initialSmartLockDevices.map((device) => (
            <li
              key={device.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <IconLock
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {device.deviceName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {SMART_LOCK_DEVICE_TYPE_LABELS[device.deviceType]}
                    {" ・ "}
                    <span className="font-mono">{device.deviceId}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PublishSwitch
                  id={device.id}
                  isPublished={device.isActive}
                  onToggle={handleToggleActive}
                  resourceLabel={`${device.deviceName} の有効状態`}
                  label={{ published: "有効", unpublished: "無効" }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${device.deviceName} を編集`}
                  onClick={() => setDialogState({ mode: "edit", device })}
                >
                  <IconPencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="icon"
                  aria-label={`${device.deviceName} を削除`}
                  disabled={isDeleting}
                  onClick={() => handleDelete(device)}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogState && (
        <SmartLockDeviceDialog
          locationId={locationId}
          mode={dialogState.mode}
          device={dialogState.mode === "edit" ? dialogState.device : undefined}
          createAction={createAction}
          updateAction={updateAction}
          open={dialogState !== null}
          onOpenChange={(open) => {
            if (!open) setDialogState(null);
          }}
        />
      )}
    </div>
  );
}

interface SmartLockDeviceDialogProps {
  readonly locationId: string;
  readonly mode: "create" | "edit";
  readonly device?: SmartLockDeviceData | undefined;
  readonly createAction: CreateSmartLockDeviceAction;
  readonly updateAction: UpdateSmartLockDeviceAction;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function SmartLockDeviceDialog({
  locationId,
  mode,
  device,
  createAction,
  updateAction,
  open,
  onOpenChange,
}: SmartLockDeviceDialogProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && device !== undefined;
  const boundAction = isEdit
    ? updateAction.bind(null, locationId, device.id)
    : createAction.bind(null, locationId);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `smart-lock-device-${mode}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: smartLockDeviceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      deviceId: device?.deviceId ?? "",
      deviceName: device?.deviceName ?? "",
      deviceType: device?.deviceType ?? SmartLockDeviceType.KEYPAD,
    },
  });

  const typeControl = useInputControl(fields.deviceType);
  const typeValue = isValidSmartLockDeviceType(typeControl.value)
    ? typeControl.value
    : SmartLockDeviceType.KEYPAD;

  const [isActive, setIsActive] = useState<boolean>(device?.isActive ?? true);

  // success → close は render 中 sync（set-state-in-effect 回避）
  const [previousResult, setPreviousResult] = useState(lastResult);
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit
          ? "スマートロックデバイスを更新しました"
          : "スマートロックデバイスを追加しました",
      );
      router.refresh();
    }
  }, [lastResult, router, isEdit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "スマートロックデバイスを編集"
              : "スマートロックデバイスを追加"}
          </DialogTitle>
          <DialogDescription>
            SwitchBot 側の device ID（MAC
            アドレス）・デバイス名・機種を入力してください。
          </DialogDescription>
        </DialogHeader>

        <form {...getFormProps(form)} action={action} className="space-y-4">
          <input
            type="hidden"
            name={fields.deviceType.name}
            value={typeValue}
          />
          <input
            type="hidden"
            name={fields.isActive.name}
            value={isActive ? "on" : ""}
          />

          <div className="space-y-2">
            <Label htmlFor={fields.deviceName.id}>デバイス名</Label>
            <Input
              {...getInputProps(fields.deviceName, { type: "text" })}
              placeholder="玄関 Keypad Touch など"
              disabled={isPending}
            />
            {fields.deviceName.errors && (
              <p
                id={fields.deviceName.errorId}
                className="text-sm text-destructive"
              >
                {fields.deviceName.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.deviceId.id}>
              デバイスID（SwitchBot MACアドレス）
            </Label>
            <Input
              {...getInputProps(fields.deviceId, { type: "text" })}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="font-mono"
              disabled={isPending}
            />
            {fields.deviceId.errors && (
              <p
                id={fields.deviceId.errorId}
                className="text-sm text-destructive"
              >
                {fields.deviceId.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.deviceType.id}>機種</Label>
            <Select
              value={typeValue}
              onValueChange={(value) => {
                if (isValidSmartLockDeviceType(value))
                  typeControl.change(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger id={fields.deviceType.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {SMART_LOCK_DEVICE_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id={fields.isActive.id}
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isPending}
            />
            <div className="space-y-1">
              <Label
                htmlFor={fields.isActive.id}
                className="text-sm font-medium leading-none"
              >
                有効にする
              </Label>
              <p className="text-sm text-muted-foreground">
                オフにするとこのデバイスへのパスコード発行が停止します。
              </p>
            </div>
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
