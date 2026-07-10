"use client";

/**
 * スマートロックデバイス登録簿（設定 > 外部連携 > SwitchBot）。
 *
 * `LocationSmartLockDevicesField.tsx`（Location 編集画面の旧 UI、locationId 固定）を
 * ベースに、拠点非依存の設定ページから全拠点横断で一覧・追加・編集・削除・有効化トグルを
 * 行えるようにしたもの。一覧は拠点ごとにグルーピングして表示する（`devices` は
 * `getAllSmartLockDevices()` の locationId → createdAt 順ソート済み配列を前提とする）。
 */

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
import {
  createSmartLockDevice,
  updateSmartLockDevice,
  deleteSmartLockDevice,
  toggleSmartLockDeviceActive,
} from "@/admin/actions/smart-lock-devices";
import type { SmartLockDeviceWithLocation } from "@/shared/domain/smart-lock/queries";

export interface SmartLockDeviceRegistryLocationOption {
  readonly id: string;
  readonly name: string;
}

interface SmartLockDeviceRegistryProps {
  readonly devices: readonly SmartLockDeviceWithLocation[];
  readonly availableLocations: readonly SmartLockDeviceRegistryLocationOption[];
}

const DEVICE_TYPE_VALUES: readonly SmartLockDeviceType[] = [
  SmartLockDeviceType.KEYPAD,
  SmartLockDeviceType.KEYPAD_TOUCH,
  SmartLockDeviceType.KEYPAD_VISION,
  SmartLockDeviceType.KEYPAD_VISION_PRO,
  SmartLockDeviceType.LOCK_VISION_PRO,
];

type DialogState =
  { mode: "create" } | { mode: "edit"; device: SmartLockDeviceWithLocation };

interface LocationGroup {
  readonly locationId: string;
  readonly locationName: string;
  readonly devices: readonly SmartLockDeviceWithLocation[];
}

type MutableLocationGroup = {
  locationId: string;
  locationName: string;
  devices: SmartLockDeviceWithLocation[];
};

function groupDevicesByLocation(
  devices: readonly SmartLockDeviceWithLocation[],
): LocationGroup[] {
  const groups: MutableLocationGroup[] = [];
  for (const device of devices) {
    const lastGroup = groups.at(-1);
    if (lastGroup && lastGroup.locationId === device.locationId) {
      lastGroup.devices.push(device);
      continue;
    }
    groups.push({
      locationId: device.locationId,
      locationName: device.locationName,
      devices: [device],
    });
  }
  return groups;
}

export function SmartLockDeviceRegistry({
  devices,
  availableLocations,
}: SmartLockDeviceRegistryProps) {
  const router = useRouter();
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (device: SmartLockDeviceWithLocation): void => {
    startDeleteTransition(async () => {
      const result = await deleteSmartLockDevice(device.id);
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
    return toggleSmartLockDeviceActive(deviceRowId, checked);
  };

  const groups = groupDevicesByLocation(devices);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          SwitchBot 製スマートロックデバイスを拠点横断で登録します（Keypad 系
          アクセサリ / Lock Vision Pro
          単体）。入退室パスコードの発行は予約確定時に 自動で行われます。
        </p>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={availableLocations.length === 0}
          onClick={() => setDialogState({ mode: "create" })}
        >
          <IconPlus className="mr-2 h-4 w-4" />
          デバイスを追加
        </Button>
      </div>

      {availableLocations.length === 0 && (
        <p className="text-sm text-destructive">
          有効な拠点が登録されていません。先に拠点を作成してください。
        </p>
      )}

      {devices.length === 0 ? (
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
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.locationId} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                {group.locationName}
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {group.devices.map((device) => (
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
            </div>
          ))}
        </div>
      )}

      {dialogState && (
        <SmartLockDeviceDialog
          mode={dialogState.mode}
          device={dialogState.mode === "edit" ? dialogState.device : undefined}
          availableLocations={availableLocations}
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
  readonly mode: "create" | "edit";
  readonly device?: SmartLockDeviceWithLocation | undefined;
  readonly availableLocations: readonly SmartLockDeviceRegistryLocationOption[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function SmartLockDeviceDialog({
  mode,
  device,
  availableLocations,
  open,
  onOpenChange,
}: SmartLockDeviceDialogProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && device !== undefined;
  const boundAction: (
    prev: SubmissionResult | undefined,
    formData: FormData,
  ) => Promise<SubmissionResult> = isEdit
    ? updateSmartLockDevice.bind(null, device.id)
    : createSmartLockDevice;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `smart-lock-device-registry-${mode}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: smartLockDeviceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      locationId: device?.locationId ?? "",
      deviceId: device?.deviceId ?? "",
      deviceName: device?.deviceName ?? "",
      deviceType: device?.deviceType ?? SmartLockDeviceType.KEYPAD,
    },
  });

  const [locationId, setLocationId] = useState<string>(
    device?.locationId ?? "",
  );

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
            拠点・SwitchBot 側の device ID（MAC アドレス）・デバイス名・機種を
            入力してください。
          </DialogDescription>
        </DialogHeader>

        <form {...getFormProps(form)} action={action} className="space-y-4">
          <input
            type="hidden"
            name={fields.locationId.name}
            value={locationId}
          />
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
            <Label htmlFor={fields.locationId.id}>拠点</Label>
            <Select
              {...(locationId !== "" ? { value: locationId } : {})}
              onValueChange={setLocationId}
              disabled={isPending || isEdit}
            >
              <SelectTrigger
                id={fields.locationId.id}
                aria-invalid={fields.locationId.errors ? true : undefined}
                aria-describedby={
                  fields.locationId.errors
                    ? fields.locationId.errorId
                    : undefined
                }
              >
                <SelectValue placeholder="拠点を選択" />
              </SelectTrigger>
              <SelectContent>
                {availableLocations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                登録後は拠点を変更できません。
              </p>
            )}
            {fields.locationId.errors && (
              <p
                id={fields.locationId.errorId}
                className="text-sm text-destructive"
              >
                {fields.locationId.errors.join(", ")}
              </p>
            )}
          </div>

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
