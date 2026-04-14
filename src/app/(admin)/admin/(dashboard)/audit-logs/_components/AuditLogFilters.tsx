"use client";

import { useQueryStates } from "nuqs";
import { adminAuditLogSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { AuditAction } from "@/shared/lib/validations/enums/prisma-types";

const ACTION_OPTIONS: { value: AuditAction | "ALL"; label: string }[] = [
  { value: "ALL", label: "すべて" },
  { value: "CREATE", label: "作成" },
  { value: "UPDATE", label: "更新" },
  { value: "DELETE", label: "削除" },
  { value: "PUBLISH", label: "公開" },
  { value: "UNPUBLISH", label: "非公開" },
  { value: "LOGIN_SUCCESS", label: "ログイン成功" },
  { value: "LOGIN_FAILED", label: "ログイン失敗" },
  { value: "PERMISSION_DENIED", label: "権限拒否" },
  { value: "PASSWORD_CHANGE", label: "パスワード変更" },
  { value: "ROLE_CHANGE", label: "ロール変更" },
];

const RESOURCE_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "space", label: "スペース" },
  { value: "reservation", label: "予約" },
  { value: "customer", label: "顧客" },
  { value: "inquiry", label: "お問い合わせ" },
  { value: "post", label: "投稿" },
  { value: "news", label: "お知らせ" },
  { value: "page", label: "固定ページ" },
  { value: "faq", label: "FAQ" },
  { value: "settings", label: "設定" },
  { value: "user", label: "ユーザー" },
  { value: "auth", label: "認証" },
];

export function AuditLogFilters() {
  const [params, setParams] = useQueryStates(adminAuditLogSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const hasFilters =
    params.action || params.resource || params.dateFrom || params.dateTo;

  const handleReset = () => {
    void setParams({
      action: null,
      resource: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={params.action || "ALL"}
        onValueChange={(value) =>
          void setParams({ action: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="アクション" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.resource || "ALL"}
        onValueChange={(value) =>
          void setParams({ resource: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="リソース" />
        </SelectTrigger>
        <SelectContent>
          {RESOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={params.dateFrom}
        onChange={(e) =>
          void setParams({ dateFrom: e.target.value || null, page: 1 })
        }
        className="w-[160px]"
        placeholder="開始日"
      />

      <Input
        type="date"
        value={params.dateTo}
        onChange={(e) =>
          void setParams({ dateTo: e.target.value || null, page: 1 })
        }
        className="w-[160px]"
        placeholder="終了日"
      />

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}
    </div>
  );
}
