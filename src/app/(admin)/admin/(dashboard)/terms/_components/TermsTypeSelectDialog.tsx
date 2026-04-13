"use client";

/**
 * 規約タイプ選択ダイアログ
 *
 * 一覧ページの「規約を追加」ボタンで開き、タイプ選択後にエディタへ遷移する。
 * Contentful/Sanity の「コンテンツタイプ選択」パターンに準拠。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconFileText,
  IconShieldLock,
  IconCalendarCancel,
  IconCreditCard,
  IconBuilding,
  IconScale,
  IconFileDescription,
} from "@tabler/icons-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Badge,
} from "@/admin/components/ui";
import { TermsType } from "@generated/prisma/enums";
import { getTemplatesForType } from "@/shared/lib/terms-templates";
import type { TablerIcon } from "@tabler/icons-react";

// =============================================================================
// Type metadata
// =============================================================================

interface TermsTypeMeta {
  type: TermsType;
  label: string;
  description: string;
  icon: TablerIcon;
}

const TERMS_TYPE_META: TermsTypeMeta[] = [
  {
    type: TermsType.TERMS_OF_USE,
    label: "利用規約",
    description: "サービスの利用条件を定める基本規約",
    icon: IconFileText,
  },
  {
    type: TermsType.PRIVACY_POLICY,
    label: "プライバシーポリシー",
    description: "個人情報の取り扱いに関するポリシー",
    icon: IconShieldLock,
  },
  {
    type: TermsType.CANCELLATION,
    label: "キャンセルポリシー",
    description: "予約キャンセルに関する料金と手順",
    icon: IconCalendarCancel,
  },
  {
    type: TermsType.PAYMENT,
    label: "支払い規約",
    description: "料金体系・決済方法・返金ルール",
    icon: IconCreditCard,
  },
  {
    type: TermsType.RENTAL_TERMS,
    label: "施設利用規約",
    description: "スペース別の利用ルール・禁止事項",
    icon: IconBuilding,
  },
  {
    type: TermsType.COMMERCIAL_TRANSACTION,
    label: "特定商取引法に基づく表記",
    description: "特定商取引法に基づく表示義務事項",
    icon: IconScale,
  },
  {
    type: TermsType.CUSTOM,
    label: "カスタム規約",
    description: "上記以外の独自規約を自由に作成",
    icon: IconFileDescription,
  },
];

// =============================================================================
// Component
// =============================================================================

export function TermsTypeSelectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSelect = (type: TermsType) => {
    setOpen(false);
    router.push(`/admin/terms/new?type=${encodeURIComponent(type)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-10 sm:min-h-9">規約を追加</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>規約タイプを選択</DialogTitle>
          <DialogDescription>
            作成する規約の種類を選んでください。テンプレートがある場合は自動で適用されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {TERMS_TYPE_META.map((meta) => {
            const hasTemplate = getTemplatesForType(meta.type).length > 0;
            const Icon = meta.icon;
            return (
              <button
                key={meta.type}
                type="button"
                className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors hover:bg-muted/50"
                onClick={() => handleSelect(meta.type)}
              >
                <div className="rounded-md bg-primary/10 p-2">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {meta.description}
                </span>
                {hasTemplate && (
                  <Badge variant="secondary" className="text-[10px]">
                    テンプレートあり
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
