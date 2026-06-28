"use client";

/**
 * メールテンプレート プレビュー & テスト送信
 *
 * - 全 19 エントリ（公開メール 18 + インフラ疎通確認 1）を category 別ドロップダウンで選択
 * - 選択 → `previewTemplateAction` → 返ってきた HTML を `<iframe srcDoc>` で表示
 * - 「実フッターを使う」チェックボックスで `getEmailFooterData()` の値を反映可
 * - 「テスト送信」で `sendTemplateTestAction` を呼び、recipient に [TEST] 付きメールを送る
 * - `__infra_check` 選択時のみ Resend simulator アドレス ドロップダウンを表示
 *
 * 設計判断:
 *  - preview は選択変更で自動 fetch。`cancelled` フラグで race（前 selectedKey の遅延応答が
 *    後 selectedKey の表示を上書き）を防止。
 *  - rate-limit は Server Action 側で authMutationRateLimiter (20/15min/IP) を強制
 *    （preview / test-send 両方）。
 *  - iframe `sandbox="allow-popups allow-popups-to-escape-sandbox"` でリンクは新規タブ確認可、
 *    script/forms/same-origin は禁止。
 *  - 結果通知は `role="status"` / `role="alert"` で SR にも届く。
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import {
  previewTemplateAction,
  sendTemplateTestAction,
} from "@/admin/actions/settings";
import {
  EMAIL_TEMPLATE_INDEX,
  TEMPLATE_CATEGORY_LABELS,
  isTemplateKey,
  type EmailTemplateIndexItem,
  type TemplateCategory,
  type TemplateKey,
} from "@/shared/emails/_registry/data";
import { isMutationError } from "@/shared/lib/mutation-result";
import { StatusBanner } from "../shared/StatusBanner";

type Props = {
  defaultRecipient: string;
};

type SimulatorOption = { value: string; label: string };

const SIMULATOR_OPTIONS: readonly SimulatorOption[] = [
  { value: "delivered@resend.dev", label: "delivered@resend.dev — 配信成功" },
  { value: "bounced@resend.dev", label: "bounced@resend.dev — バウンス" },
  { value: "complained@resend.dev", label: "complained@resend.dev — 苦情" },
  { value: "suppressed@resend.dev", label: "suppressed@resend.dev — 配信抑制" },
] as const;

type SendResult =
  | { success: true; messageId: string }
  | { success: false; message: string }
  | null;

const ORDERED_CATEGORIES: ReadonlyArray<TemplateCategory> = [
  "reservation",
  "event",
  "inquiry",
  "account",
  "system",
];

/** RFC 5321 を完全満たす regex は無理だが、`a@b.c` 形式のフォームバリデーション用途には十分。 */
const SIMPLE_EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function groupByCategory(): Record<TemplateCategory, EmailTemplateIndexItem[]> {
  const grouped: Record<TemplateCategory, EmailTemplateIndexItem[]> = {
    reservation: [],
    event: [],
    inquiry: [],
    account: [],
    system: [],
  };
  for (const item of EMAIL_TEMPLATE_INDEX) {
    grouped[item.category].push(item);
  }
  return grouped;
}

export function EmailTemplatesSection({ defaultRecipient }: Props) {
  const selectId = useId();
  const recipientId = useId();
  const simulatorId = useId();
  const realFooterId = useId();

  const grouped = groupByCategory();
  const firstKey: TemplateKey =
    EMAIL_TEMPLATE_INDEX[0]?.key ?? "reservation-confirmation";

  const [selectedKey, setSelectedKey] = useState<TemplateKey>(firstKey);
  const [useRealFooter, setUseRealFooter] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreviewTransition] = useTransition();
  const previewSeqRef = useRef(0);

  const [recipient, setRecipient] = useState(defaultRecipient);
  const [simulatorValue, setSimulatorValue] = useState("");
  const [sendPending, startSendTransition] = useTransition();
  const [sendResult, setSendResult] = useState<SendResult>(null);

  const selectedEntry =
    EMAIL_TEMPLATE_INDEX.find((e) => e.key === selectedKey) ?? null;
  const isInfraCheck = selectedKey === "__infra_check";
  const isValidRecipient = SIMPLE_EMAIL_REGEX.test(recipient.trim());

  // 選択変更 / 実フッター切替で preview を再 fetch。
  // - setState は transition の async コールバック内のみで呼ぶ（react-hooks/set-state-in-effect 遵守）
  // - seq id ガードで「前の selectedKey の応答が後で resolve して上書き」する race を防止
  useEffect(() => {
    const mySeq = ++previewSeqRef.current;
    startPreviewTransition(async () => {
      setPreviewError(null);
      setPreviewHtml("");
      const response = await previewTemplateAction(selectedKey, {
        useRealFooter,
      });
      if (previewSeqRef.current !== mySeq) return;
      if (isMutationError(response)) {
        setPreviewError(response.error);
        setPreviewHtml("");
      } else {
        setPreviewHtml(response.html);
      }
    });
  }, [selectedKey, useRealFooter]);

  const handleSimulatorChange = (value: string) => {
    setSimulatorValue(value);
    setRecipient(value);
    setSendResult(null);
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    if (value !== simulatorValue) setSimulatorValue("");
    setSendResult(null);
  };

  const handleSend = () => {
    startSendTransition(async () => {
      setSendResult(null);
      const response = await sendTemplateTestAction(
        selectedKey,
        recipient.trim(),
        {
          useRealFooter,
          ...(isInfraCheck &&
            simulatorValue !== "" &&
            recipient === simulatorValue && { simulatorAddress: true }),
        },
      );
      if (isMutationError(response)) {
        setSendResult({ success: false, message: response.error });
        toast.error("テスト送信に失敗しました");
      } else {
        setSendResult({ success: true, messageId: response.messageId });
        toast.success("テスト送信しました");
      }
    });
  };

  const subjectPreview = selectedEntry ? `[TEST] ${selectedEntry.label}` : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>テンプレートを選択</CardTitle>
          <CardDescription>
            送信される予約・イベント・お問い合わせ等の全テンプレートを一覧から確認できます。
            選択するとプレビューが下に表示され、任意の宛先にテスト送信もできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={selectId}>テンプレート種別</Label>
            <Select
              value={selectedKey}
              onValueChange={(v) => {
                if (isTemplateKey(v)) setSelectedKey(v);
              }}
              disabled={previewPending}
            >
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDERED_CATEGORIES.map((cat) => {
                  const items = grouped[cat];
                  if (items.length === 0) return null;
                  return (
                    <SelectGroup key={cat}>
                      <SelectLabel>{TEMPLATE_CATEGORY_LABELS[cat]}</SelectLabel>
                      {items.map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedEntry && (
              <p className="text-xs text-muted-foreground">
                {selectedEntry.description}
              </p>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Switch
              id={realFooterId}
              checked={useRealFooter}
              onCheckedChange={setUseRealFooter}
              disabled={previewPending}
            />
            <div className="space-y-1">
              <Label htmlFor={realFooterId} className="cursor-pointer">
                実フッターを使う
              </Label>
              <p className="text-xs text-muted-foreground">
                事業者情報・規約リンクを設定値で描画します
                （プレビュー再生成時に DB 取得が入ります）。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>プレビュー</CardTitle>
          <CardDescription>
            実際にお客様に送られるメールと同じ HTML を表示します。
            リンクは新規タブで開けます（クリックで実際の遷移先を確認）。
          </CardDescription>
        </CardHeader>
        <CardContent aria-busy={previewPending}>
          {previewError ? (
            <div role="alert">
              <StatusBanner success={false}>
                <p className="text-sm text-destructive">{previewError}</p>
              </StatusBanner>
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-border">
              <iframe
                title={`プレビュー: ${selectedEntry?.label ?? selectedKey}`}
                srcDoc={previewHtml}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="min-h-[480px] h-[70vh] max-h-[720px] w-full bg-white"
              />
            </div>
          )}
          {previewPending && (
            <p
              className="mt-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              読み込み中...
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>テスト送信</CardTitle>
          <CardDescription>
            選択中のテンプレートをサンプルデータで実際に送信します。subject に
            <code className="mx-1 rounded bg-muted px-1 py-0.5">[TEST]</code>
            プレフィックスが付き、Resend dashboard では
            <code className="mx-1 rounded bg-muted px-1 py-0.5">
              category=template_test
            </code>
            タグでフィルタできます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={recipientId}>宛先メールアドレス</Label>
            <Input
              id={recipientId}
              type="email"
              value={recipient}
              onChange={(e) => handleRecipientChange(e.target.value)}
              placeholder="admin@example.com"
              disabled={sendPending}
              aria-invalid={!isValidRecipient && recipient.length > 0}
            />
          </div>

          {isInfraCheck && (
            <div className="space-y-1.5">
              <Label htmlFor={simulatorId}>
                Resend テスト用アドレス（インフラ疎通確認のみ）
              </Label>
              <Select
                value={simulatorValue}
                onValueChange={handleSimulatorChange}
                disabled={sendPending}
              >
                <SelectTrigger id={simulatorId} className="w-full">
                  <SelectValue placeholder="（選択なし）" />
                </SelectTrigger>
                <SelectContent>
                  {SIMULATOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Resend 公式 simulator アドレス。実際の受信箱は使われず、Resend
                ダッシュボードでバウンス・苦情等の挙動を確認できます。
              </p>
            </div>
          )}

          {sendResult && (
            <div
              role={sendResult.success ? "status" : "alert"}
              aria-live="polite"
            >
              <StatusBanner success={sendResult.success}>
                {sendResult.success ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-success">
                      送信しました
                    </p>
                    {subjectPreview && (
                      <p className="text-xs text-muted-foreground">
                        件名:{" "}
                        <code className="font-mono text-foreground">
                          {subjectPreview}
                        </code>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      送信 ID:{" "}
                      <code className="font-mono text-foreground">
                        {sendResult.messageId}
                      </code>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">
                    {sendResult.message}
                  </p>
                )}
              </StatusBanner>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              onClick={handleSend}
              disabled={sendPending || !isValidRecipient}
              aria-busy={sendPending}
            >
              {sendPending ? "送信中..." : "テスト送信"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
