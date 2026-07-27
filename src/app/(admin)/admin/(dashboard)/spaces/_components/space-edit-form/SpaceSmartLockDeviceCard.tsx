"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { setSpaceSmartLockDevice } from "@/admin/actions/space-smart-lock-devices";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { SELECT_NONE_VALUE } from "./constants";

type SetSpaceSmartLockDeviceState = MutationResult<{
  id: string;
  smartLockDeviceId: string | null;
}> | null;

type SpaceSmartLockDeviceCardProps = {
  readonly spaceId: string;
  readonly initialDeviceId: string | null;
  readonly availableDevices: readonly SmartLockDeviceData[];
};

/**
 * スマートロックデバイスの割り当て（`Space.smartLockDeviceId`）専用の独立フォーム。
 *
 * カテゴリー等のスペース属性と異なり、割り当ては別モデル（SmartLockDevice、同一拠点の
 * 登録簿）への参照更新であり、メインフォームの保存タイミングとは独立してすぐ反映したい
 * 運用上の要請があるため、`useActionState` で `setSpaceSmartLockDevice` を直接呼び出す。
 */
export function SpaceSmartLockDeviceCard({
  spaceId,
  initialDeviceId,
  availableDevices,
}: SpaceSmartLockDeviceCardProps) {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId ?? "");

  const [saveResult, submitDeviceChange, isSaving] = useActionState<
    SetSpaceSmartLockDeviceState,
    string | null
  >(async (_prevState, nextDeviceId) => {
    return setSpaceSmartLockDevice(spaceId, nextDeviceId);
  }, null);

  useEffect(() => {
    if (!saveResult) return;
    if (isMutationError(saveResult)) {
      toast.error(saveResult.error);
      return;
    }
    toast.success("スマートロックデバイスの割り当てを保存しました");
    router.refresh();
  }, [saveResult, router]);

  const activeDevices = availableDevices.filter((device) => device.isActive);

  return (
    <Card>
      <CardHeader>
        <CardTitle>スマートロックデバイス</CardTitle>
      </CardHeader>
      <CardContent>
        {/*
         * このカードはSpaceEditFormの外側<form>の内側に配置されるため、ここに
         * <form>をネストしない（invalid HTMLかつブラウザのform送信/ownership挙動が
         * 干渉する）。保存はtype="button"のクリックハンドラから直接actionを呼ぶ。
         */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="space-smartLockDeviceId">割り当てデバイス</Label>
            {activeDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                同一拠点内に有効なスマートロックデバイスが登録されていません。拠点管理画面から先に登録してください。
              </p>
            ) : (
              <Select
                value={deviceId === "" ? SELECT_NONE_VALUE : deviceId}
                onValueChange={(value) =>
                  setDeviceId(value === SELECT_NONE_VALUE ? "" : value)
                }
                disabled={isSaving}
              >
                <SelectTrigger id="space-smartLockDeviceId">
                  <SelectValue placeholder="デバイスを選択（任意、同一拠点内の登録済みデバイスのみ選択可）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                  {activeDevices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.deviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              入退室パスコードの発行対象デバイスです（無効化されたデバイスは選択肢に表示されません）。デバイスの登録・編集は拠点管理画面から行います。この設定は保存すると即座に反映されます。
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() =>
                submitDeviceChange(deviceId === "" ? null : deviceId)
              }
              disabled={isSaving}
            >
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
