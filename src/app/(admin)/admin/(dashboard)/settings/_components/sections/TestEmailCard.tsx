"use client";

/**
 * テスト送信カード（メール設定の動作確認）
 *
 * useTransition + sendTestEmailAction を直接呼ぶ単発 button パターン。
 * conform form を介さない（ResendSection の接続テストと同型）。
 */

import { useState, useTransition, useId } from "react";
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
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { isMutationError } from "@/shared/lib/mutation-result";
import { sendTestEmailAction } from "@/admin/actions/settings";
import { StatusBanner } from "../shared/StatusBanner";

type SimulatorOption = {
  value: string;
  label: string;
};

const SIMULATOR_OPTIONS: readonly SimulatorOption[] = [
  { value: "delivered@resend.dev", label: "delivered@resend.dev — 配信成功" },
  { value: "bounced@resend.dev", label: "bounced@resend.dev — バウンス" },
  { value: "complained@resend.dev", label: "complained@resend.dev — 苦情" },
  { value: "suppressed@resend.dev", label: "suppressed@resend.dev — 配信抑制" },
] as const;

type TestEmailCardProps = {
  defaultRecipient: string;
};

export function TestEmailCard({ defaultRecipient }: TestEmailCardProps) {
  const recipientId = useId();
  const simulatorId = useId();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [simulatorValue, setSimulatorValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { success: true; messageId: string }
    | { success: false; message: string }
    | null
  >(null);

  const isSimulator = simulatorValue !== "" && recipient === simulatorValue;

  const handleSimulatorChange = (value: string) => {
    setSimulatorValue(value);
    setRecipient(value);
    setResult(null);
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    if (value !== simulatorValue) setSimulatorValue("");
    setResult(null);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      setResult(null);
      const response = await sendTestEmailAction(recipient, {
        simulatorAddress: isSimulator,
      });
      if (isMutationError(response)) {
        setResult({ success: false, message: response.error });
        toast.error("テスト送信に失敗しました");
      } else {
        setResult({ success: true, messageId: response.messageId });
        toast.success("テスト送信しました");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>設定の動作確認（テスト送信）</CardTitle>
        <CardDescription>
          現在のメール設定でテストメールを送信し、送信元・Reply-To・Resend API
          連携が正しく機能しているかを確認します。
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
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            自分のメールアドレスが初期値で入っています。受信箱で実際の到達を確認したい場合はそのまま、送信パイプラインだけ確認したい場合は下の
            simulator から選択してください。
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={simulatorId}>
            または Resend テスト用アドレスを使う
          </Label>
          <Select
            value={simulatorValue}
            onValueChange={handleSimulatorChange}
            disabled={pending}
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
            Resend 公式の simulator アドレス。実際の受信箱は使われず、Resend
            ダッシュボードでバウンス・苦情等の挙動を確認できます。
          </p>
        </div>

        {result && (
          <StatusBanner success={result.success}>
            {result.success ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-success">送信しました</p>
                <p className="text-xs text-muted-foreground">
                  送信 ID:{" "}
                  <code className="font-mono text-foreground">
                    {result.messageId || "(disabled mode)"}
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  受信箱を確認してください。simulator アドレスの場合は Resend
                  ダッシュボードで配信イベントを確認できます。
                </p>
              </div>
            ) : (
              <p className="text-sm text-destructive">{result.message}</p>
            )}
          </StatusBanner>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSubmit}
            disabled={pending || recipient.length === 0}
          >
            {pending ? "送信中..." : "テスト送信"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
