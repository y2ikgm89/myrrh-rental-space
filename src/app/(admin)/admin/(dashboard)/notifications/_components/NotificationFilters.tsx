"use client";

import { useQueryStates } from "nuqs";
import { adminNotificationSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
  type NotificationType,
} from "@/shared/lib/validations/enums/helpers";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "すべて" },
  ...Object.values(NOTIFICATION_TYPE).map((value) => ({
    value,
    label: NOTIFICATION_TYPE_LABELS[value as NotificationType],
  })),
];

const READ_STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "unread", label: "未読のみ" },
  { value: "read", label: "既読のみ" },
];

export function NotificationFilters() {
  const [params, setParams] = useQueryStates(
    adminNotificationSearchParamsParsers,
    {
      history: "push",
      shallow: false,
    },
  );

  const hasFilters = params.type || params.isRead;

  const handleReset = () => {
    void setParams({
      type: null,
      isRead: null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={params.type || "ALL"}
        onValueChange={(value) =>
          void setParams({ type: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="通知タイプ" />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.isRead || "ALL"}
        onValueChange={(value) =>
          void setParams({ isRead: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="既読状態" />
        </SelectTrigger>
        <SelectContent>
          {READ_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}
    </div>
  );
}
