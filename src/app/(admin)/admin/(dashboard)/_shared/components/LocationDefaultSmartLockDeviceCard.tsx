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
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { setLocationDefaultSmartLockDevice } from "@/admin/actions/location-smart-lock-devices";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";

const SELECT_NONE_VALUE = "__none__";

type LocationDefaultSmartLockDeviceCardProps = {
  readonly locationId: string;
  readonly initialDeviceId: string | null;
  readonly availableDevices: readonly SmartLockDeviceData[];
};

type SetLocationDefaultSmartLockDeviceState = MutationResult<{
  id: string;
  defaultSmartLockDeviceId: string | null;
}> | null;

/**
 * 拠点の既定スマートロックデバイス（`Location.defaultSmartLockDeviceId`）選択専用の
 * 独立フォーム。
 *
 * デバイスの登録・編集・削除は設定ページ（外部連携 > SwitchBot）に移設済みで、
 * この画面では登録簿から既定デバイスを 1 つ選ぶだけのシンプルな select にする。
 * `LocationForm` の保存タイミングとは独立してすぐ反映したい運用上の要請があるため、
 * `useActionState` で `setLocationDefaultSmartLockDevice` を直接呼び出す。
 */
export function LocationDefaultSmartLockDeviceCard({
  locationId,
  initialDeviceId,
  availableDevices,
}: LocationDefaultSmartLockDeviceCardProps) {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId ?? "");

  const [saveResult, submitDeviceChange, isSaving] = useActionState<
    SetLocationDefaultSmartLockDeviceState,
    string | null
  >(async (_prevState, nextDeviceId) => {
    return setLocationDefaultSmartLockDevice(locationId, nextDeviceId);
  }, null);

  useEffect(() => {
    if (!saveResult) return;
    if (isMutationError(saveResult)) {
      toast.error(saveResult.error);
      return;
    }
    toast.success("既定のスマートロックデバイスを保存しました");
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
         * このカードはLocationFormの外側<form>の内側に配置されるため、ここに
         * <form>をネストしない（invalid HTMLかつブラウザのform送信/ownership挙動が
         * 干渉する）。保存はtype="button"のクリックハンドラから直接actionを呼ぶ。
         */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="location-defaultSmartLockDeviceId">
              既定デバイス
            </Label>
            {activeDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                この拠点に有効なスマートロックデバイスが登録されていません。設定ページ（外部連携
                &gt; SwitchBot）から先に登録してください。
              </p>
            ) : (
              <Select
                value={deviceId === "" ? SELECT_NONE_VALUE : deviceId}
                onValueChange={(value) =>
                  setDeviceId(value === SELECT_NONE_VALUE ? "" : value)
                }
                disabled={isSaving}
              >
                <SelectTrigger id="location-defaultSmartLockDeviceId">
                  <SelectValue placeholder="デバイスを選択（任意）" />
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
              この拠点に新規スペースを作成したとき、パスコード発行対象デバイスの初期値として
              引き継がれます（無効化されたデバイスは選択肢に表示されません）。デバイスの登録・
              編集・削除は設定ページ（外部連携 &gt;
              SwitchBot）から行います。この設定は保存すると即座に反映されます。
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
