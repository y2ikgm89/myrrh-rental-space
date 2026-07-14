"use client";

/**
 * SpaceRatePlanList
 *
 * Space 編集フォームの料金タブに埋め込む SpaceRatePlan（曜日・時間帯・期間別の
 * 時間料金ルール）一覧テーブル。`BlockedDatesField` / `SmartLockDeviceRegistry`
 * と同型の設計（タブ内に独立マウントするサブリソース CRUD）:
 * 一覧表示 + 追加ボタン + 行ごとの編集/削除アイコンボタン。
 *
 * `SpaceRatePlanEditModal` は対象（新規作成 or 既存 plan の編集）が変わるたびに
 * 条件付きマウント（`modalTarget !== null &&`）する。Dialog の `open` prop だけを
 * 切り替える設計だと、plan A の編集から plan B の編集へ切り替えたときに内部
 * `useForm` state が古い defaultValue を保持したまま残る（`SmartLockDeviceRegistry`
 * の `dialogState && <...Dialog open={dialogState !== null} .../>` と同じ回避策）。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { EmptyState } from "@/admin/components/EmptyState";
import { deleteSpaceRatePlanAction } from "@/admin/actions/space-rate-plan";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { formatJstDateOnly } from "@/shared/lib/date-format";
import { DayOfWeek } from "@/shared/lib/validations/enums/prisma-types";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";
import { SpaceRatePlanEditModal } from "./SpaceRatePlanEditModal";

/** 曜日チェックボックス・曜日表示の並び順 SSoT（月曜始まり）。`SpaceRatePlanEditModal` と共有。 */
export const ALL_DAYS_OF_WEEK: readonly DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

/** 曜日の日本語 1 文字ラベル SSoT。`SpaceRatePlanEditModal` のチェックボックスと共有。 */
export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.MONDAY]: "月",
  [DayOfWeek.TUESDAY]: "火",
  [DayOfWeek.WEDNESDAY]: "水",
  [DayOfWeek.THURSDAY]: "木",
  [DayOfWeek.FRIDAY]: "金",
  [DayOfWeek.SATURDAY]: "土",
  [DayOfWeek.SUNDAY]: "日",
};

function formatDaysOfWeek(days: readonly DayOfWeek[]): string {
  if (days.length === 0) return "全曜日";
  return ALL_DAYS_OF_WEEK.filter((day) => days.includes(day))
    .map((day) => DAY_OF_WEEK_LABELS[day])
    .join("・");
}

/** `startTime`/`endTime` は "HH:MM" 文字列、null は resolver の意味論通り 00:00/24:00（終日側）。 */
function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
): string {
  if (startTime === null && endTime === null) return "終日";
  return `${startTime ?? "00:00"} 〜 ${endTime ?? "24:00"}`;
}

function formatEffectivePeriod(
  effectiveFrom: Date | null,
  effectiveTo: Date | null,
): string {
  if (effectiveFrom === null && effectiveTo === null) return "無期限";
  const from = effectiveFrom ? formatJstDateOnly(effectiveFrom) : "";
  const to = effectiveTo ? formatJstDateOnly(effectiveTo) : "";
  if (from === "") return `〜${to}`;
  if (to === "") return `${from}〜`;
  return `${from} 〜 ${to}`;
}

type SpaceRatePlanListProps = {
  readonly spaceId: string;
  readonly plans: SpaceRatePlanForResolver[];
};

/** モーダルの対象。新規作成、または既存 plan の編集。 */
type ModalTarget = "create" | SpaceRatePlanForResolver;

export function SpaceRatePlanList({ spaceId, plans }: SpaceRatePlanListProps) {
  const router = useRouter();
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<SpaceRatePlanForResolver | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (): void => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDeleteTransition(async () => {
      const result = await deleteSpaceRatePlanAction(target.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("料金プランを削除しました");
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <EmptyState
          message="料金プランが登録されていません"
          description="曜日・時間帯・期間ごとに異なる時間料金を設定できます。未設定の場合はスペースの基本時間料金がそのまま適用されます。"
          action={{
            label: "新規プラン追加",
            onClick: () => setModalTarget("create"),
          }}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="hidden lg:table-cell">曜日</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      時間帯
                    </TableHead>
                    <TableHead className="hidden xl:table-cell">期間</TableHead>
                    <TableHead className="text-right">料金</TableHead>
                    <TableHead className="w-28 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatDaysOfWeek(plan.daysOfWeek)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatTimeRange(plan.startTime, plan.endTime)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatEffectivePeriod(
                            plan.effectiveFrom,
                            plan.effectiveTo,
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(plan.hourlyPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${plan.name} を編集`}
                            onClick={() => setModalTarget(plan)}
                          >
                            <IconPencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive-ghost"
                            size="icon"
                            aria-label={`${plan.name} を削除`}
                            disabled={isDeleting}
                            onClick={() => setDeleteTarget(plan)}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalTarget("create")}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              新規プラン追加
            </Button>
          </div>
        </>
      )}

      {modalTarget !== null && (
        <SpaceRatePlanEditModal
          spaceId={spaceId}
          plan={modalTarget === "create" ? undefined : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      )}

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        itemName={deleteTarget?.name ?? ""}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </div>
  );
}
