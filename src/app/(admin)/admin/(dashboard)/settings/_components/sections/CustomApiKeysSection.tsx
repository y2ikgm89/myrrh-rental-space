"use client";

/**
 * カスタムAPIキーセクション
 *
 * 汎用的なAPIキーの管理
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/admin/contexts/confirm-context";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui/dialog";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { addCustomApiKey, deleteCustomApiKey } from "@/admin/actions/api-keys";
import type { CustomApiKeyData } from "@/admin/types/api-keys";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatDateTimeShort } from "@/shared/lib/date-format";

// =============================================================================
// Types
// =============================================================================

interface CustomApiKeysSectionProps {
  keys: CustomApiKeyData[];
}

// =============================================================================
// Main Component
// =============================================================================

export function CustomApiKeysSection({ keys }: CustomApiKeysSectionProps) {
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    keyName: "",
    keyValue: "",
    description: "",
  });

  const handleAdd = () => {
    startTransition(async () => {
      const result = await addCustomApiKey(formData);
      if (!isMutationError(result)) {
        setFormData({ name: "", keyName: "", keyValue: "", description: "" });
        setIsDialogOpen(false);
      }
      if (isMutationError(result)) {
        toast.error(result.error || "保存に失敗しました");
      } else {
        toast.success("APIキーを追加しました");
        router.refresh();
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: "APIキーを削除しますか？",
      description: `「${name}」を削除しますか？`,
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteCustomApiKey(id);
      if (isMutationError(result)) {
        toast.error(result.error || "保存に失敗しました");
      } else {
        toast.success("APIキーを削除しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              カスタムAPIキー
            </CardTitle>
            <CardDescription>
              その他の外部サービスのAPIキーを管理
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <IconPlus className="mr-2 h-4 w-4" />
                追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>APIキーを追加</DialogTitle>
                <DialogDescription>
                  サービス名とAPIキーのペアを追加します
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">サービス名</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="例: SendGrid, OpenAI"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keyName">キー名</Label>
                  <Input
                    id="keyName"
                    value={formData.keyName}
                    onChange={(e) =>
                      setFormData({ ...formData, keyName: e.target.value })
                    }
                    placeholder="例: API_KEY, ACCESS_TOKEN"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keyValue">キー値</Label>
                  <Input
                    id="keyValue"
                    type="password"
                    value={formData.keyValue}
                    onChange={(e) =>
                      setFormData({ ...formData, keyValue: e.target.value })
                    }
                    placeholder="APIキーの値"
                    className="font-mono"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    キーは暗号化して保存されます
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">説明（任意）</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="このAPIキーの用途"
                    disabled={isPending}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <SubmitButton
                  isPending={isPending}
                  label="追加"
                  pendingLabel="追加中..."
                  onClick={handleAdd}
                  disabled={
                    !formData.name || !formData.keyName || !formData.keyValue
                  }
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            カスタムAPIキーが登録されていません
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((data) => (
              <div
                key={data.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{data.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {data.keyName}: ****
                  </div>
                  {data.description && (
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {data.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    作成: {formatDateTimeShort(data.createdAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(data.id, data.name)}
                  disabled={isPending}
                  className="ml-4"
                >
                  <IconTrash className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
