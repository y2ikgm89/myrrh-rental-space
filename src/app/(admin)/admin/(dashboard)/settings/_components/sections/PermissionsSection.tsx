"use client";

/**
 * 権限設定セクション
 *
 * SaaS標準のシンプルなロール説明UI
 * 各ロールの「できること」「できないこと」を明確に表示
 */

import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@/admin/components/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/admin/components/ui/accordion";
import {
  IconShield,
  IconSettings,
  IconEdit,
  IconEye,
  IconCheck,
  IconX,
  IconChevronRight,
} from "@tabler/icons-react";
import { type DashboardRole, ROLE_LABELS } from "@/shared/lib/admin-roles";

// =============================================================================
// Types & Constants
// =============================================================================

interface RoleConfig {
  id: DashboardRole;
  icon: typeof IconShield;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  capabilities: readonly string[];
  restrictions: readonly string[];
}

const ROLE_CONFIGS: readonly RoleConfig[] = [
  {
    id: "SUPER_ADMIN",
    icon: IconShield,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/20",
    description: "システム全体を管理できる最上位の権限",
    capabilities: [
      "すべての機能へのフルアクセス",
      "管理者・編集者・閲覧者の追加・削除・権限変更",
      "監査ログの閲覧",
      "システム設定の変更",
      "API キーの管理",
    ],
    restrictions: [
      "ロール変更は Google Admin のグループ所属で実施",
      "通常スタッフの日常運用には付与しない",
    ],
  },
  {
    id: "ADMIN",
    icon: IconSettings,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    description: "日常的なコンテンツ管理を担当",
    capabilities: [
      "スペース・予約・顧客の管理",
      "投稿・ニュース・ページの作成・編集・公開",
      "FAQ・お問い合わせの管理",
      "サイト設定（ナビゲーション・告知バー等）",
    ],
    restrictions: [
      "SUPER_ADMIN / ADMIN ロールグループの管理",
      "監査ログの閲覧",
      "API キーや外部連携などの特権設定",
      "Google Admin / GCP 側の権限変更",
    ],
  },
  {
    id: "EDITOR",
    icon: IconEdit,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/20",
    description: "割り当てられたコンテンツのみ編集可能",
    capabilities: [
      "割り当てられたページの編集",
      "投稿・ニュースの作成・編集",
      "コンテンツのプレビュー",
    ],
    restrictions: [
      "コンテンツの公開・削除",
      "予約・顧客情報の編集",
      "システム設定へのアクセス",
      "スタッフ管理",
    ],
  },
  {
    id: "VIEWER",
    icon: IconEye,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
    description: "データの閲覧のみ可能",
    capabilities: [
      "ダッシュボードの閲覧",
      "予約・顧客データの確認",
      "コンテンツの閲覧",
    ],
    restrictions: [
      "すべての編集・削除操作",
      "設定変更",
      "データのエクスポート",
      "スタッフ管理",
    ],
  },
];

// =============================================================================
// Sub Components
// =============================================================================

function RoleCard({ config }: { config: RoleConfig }) {
  const Icon = config.icon;

  return (
    <Card className={cn(config.borderColor, "border-l-4")}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", config.bgColor)}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div>
            <CardTitle className="text-lg">{ROLE_LABELS[config.id]}</CardTitle>
            <CardDescription className="text-sm mt-0.5">
              {config.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* できること */}
        <div>
          <h4 className="text-sm font-medium text-success mb-2 flex items-center gap-1.5">
            <IconCheck className="h-4 w-4" />
            できること
          </h4>
          <ul className="space-y-1.5">
            {config.capabilities.map((item) => (
              <li
                key={item}
                className="text-sm text-muted-foreground flex items-start gap-2"
              >
                <span className="text-success mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* 制限 */}
        {config.restrictions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-destructive mb-2 flex items-center gap-1.5">
              <IconX className="h-4 w-4" />
              制限
            </h4>
            <ul className="space-y-1.5">
              {config.restrictions.map((item) => (
                <li
                  key={item}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-destructive/60 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickTips() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ロール選択のヒント</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="destructive" className="mt-0.5">
              推奨
            </Badge>
            <div>
              <p className="text-sm font-medium">オーナー・責任者</p>
              <p className="text-xs text-muted-foreground">
                → {ROLE_LABELS.SUPER_ADMIN}（最小限に）
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="default" className="mt-0.5">
              推奨
            </Badge>
            <div>
              <p className="text-sm font-medium">運営担当スタッフ</p>
              <p className="text-xs text-muted-foreground">
                → {ROLE_LABELS.ADMIN}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="secondary" className="mt-0.5">
              推奨
            </Badge>
            <div>
              <p className="text-sm font-medium">ライター・コンテンツ担当</p>
              <p className="text-xs text-muted-foreground">
                → {ROLE_LABELS.EDITOR}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Badge variant="outline" className="mt-0.5">
              推奨
            </Badge>
            <div>
              <p className="text-sm font-medium">確認のみ必要な方</p>
              <p className="text-xs text-muted-foreground">
                → {ROLE_LABELS.VIEWER}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccessModel() {
  const gates = [
    {
      title: "IAP 許可",
      description:
        "Cloud Run direct IAP が Google アカウントを認証し、許可グループだけを通します。",
      icon: IconShield,
    },
    {
      title: "Google Group ロール",
      description:
        "Google Admin のロール別グループ所属をアプリ内ロールの正として扱います。",
      icon: IconSettings,
    },
    {
      title: "自動同期",
      description:
        "初回アクセス時にスタッフレコードを作成し、以後のログインでロールを同期します。",
      icon: IconCheck,
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">管理画面アクセスの3段階</CardTitle>
        <CardDescription>
          Googleログインだけでは管理画面に入れません。IAP許可、ロール別Google
          Group、アプリ同期の3つを確認します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {gates.map((gate) => {
            const Icon = gate.icon;
            return (
              <div key={gate.title} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{gate.title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {gate.description}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PermissionsSection() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">権限設定</h2>
          <p className="text-sm text-muted-foreground">
            スタッフに割り当てるロールの権限を確認できます
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff">
            スタッフ管理
            <IconChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>

      <AccessModel />

      {/* ロールカード */}
      <div className="grid gap-4 md:grid-cols-2">
        {ROLE_CONFIGS.map((config) => (
          <RoleCard key={config.id} config={config} />
        ))}
      </div>

      {/* ヒント */}
      <QuickTips />

      {/* 補足情報 */}
      <Accordion type="single" collapsible>
        <AccordionItem value="details">
          <AccordionTrigger className="text-sm">
            権限の詳細について
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">
                  編集者の割り当てページ：
                </strong>
                編集者ロールのスタッフには、編集可能なページを個別に割り当てることができます。
                スタッフ詳細ページの「割り当てページ」セクションで設定してください。
              </p>
              <p>
                <strong className="text-foreground">
                  セキュリティの推奨事項：
                </strong>
                スーパー管理者権限は必要最小限のスタッフのみに付与してください。
                日常業務には管理者または編集者ロールで十分です。
              </p>
              <p>
                <strong className="text-foreground">監査ログ：</strong>
                スーパー管理者のみがアクセスできる監査ログでは、
                すべてのスタッフの操作履歴を確認できます。
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
