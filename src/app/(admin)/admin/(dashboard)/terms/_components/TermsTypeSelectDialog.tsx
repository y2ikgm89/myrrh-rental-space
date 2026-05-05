"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBuilding,
  IconCalendarCancel,
  IconCookie,
  IconCreditCard,
  IconFileDescription,
  IconFileText,
  IconPlus,
  IconScale,
  IconShieldLock,
  IconStar,
  type TablerIcon,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui";
import {
  TERMS_TYPE_VALUES,
  type TermsTypeValue,
} from "@/shared/lib/validations/terms";
import { getTemplatesForType } from "@/shared/lib/terms-templates";

interface TermsTypeMeta {
  readonly type: TermsTypeValue;
  readonly label: string;
  readonly description: string;
  readonly icon: TablerIcon;
}

const TERMS_TYPE_META: Record<TermsTypeValue, Omit<TermsTypeMeta, "type">> = {
  "terms-of-use": {
    label: "利用規約",
    description: "サービスの利用条件を定める基本規約",
    icon: IconFileText,
  },
  "privacy-policy": {
    label: "プライバシーポリシー",
    description: "個人情報の取り扱いに関するポリシー",
    icon: IconShieldLock,
  },
  cancellation: {
    label: "キャンセルポリシー",
    description: "予約キャンセルに関する料金と手順",
    icon: IconCalendarCancel,
  },
  payment: {
    label: "支払い規約",
    description: "料金体系・決済方法・返金ルール",
    icon: IconCreditCard,
  },
  "rental-terms": {
    label: "施設利用規約",
    description: "スペース別の利用ルール・禁止事項",
    icon: IconBuilding,
  },
  "commercial-transaction": {
    label: "特定商取引法に基づく表記",
    description: "特定商取引法に基づく表示義務事項",
    icon: IconScale,
  },
  "review-guidelines": {
    label: "レビュー投稿ガイドライン",
    description: "レビュー投稿の基準・禁止事項・モデレーション方針",
    icon: IconStar,
  },
  "cookie-policy": {
    label: "Cookie ポリシー",
    description: "Cookie および類似技術の利用に関するポリシー",
    icon: IconCookie,
  },
  custom: {
    label: "カスタム規約",
    description: "上記以外の独自規約を白紙から作成",
    icon: IconFileDescription,
  },
};

export function TermsTypeSelectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSelect = (type: TermsTypeValue) => {
    setOpen(false);
    router.push(`/admin/terms/new?type=${encodeURIComponent(type)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <IconPlus className="mr-2 h-4 w-4" />
          新規作成
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>規約タイプを選択</DialogTitle>
          <DialogDescription>
            作成する規約の種類を選んでください。標準テンプレートがある場合は本文と事業者情報が自動で投入されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {TERMS_TYPE_VALUES.map((type) => {
            const meta = TERMS_TYPE_META[type];
            const hasTemplate = getTemplatesForType(type).length > 0;
            const Icon = meta.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelect(type)}
                className="flex min-h-11 flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`${meta.label}を新規作成`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
                  </div>
                  {hasTemplate ? (
                    <Badge variant="secondary" className="text-xs">
                      テンプレート
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      白紙
                    </Badge>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground">
                  {meta.label}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
