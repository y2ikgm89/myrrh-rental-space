"use client";

import type { ReactElement } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";

export type ExternalLinkInput = {
  /** React reconciliation 用の安定 key（form 送信時は schema preprocess で除外）。 */
  _key?: string;
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
};

type ExternalLinksFieldProps = {
  links: readonly ExternalLinkInput[];
  onChange: (next: ExternalLinkInput[]) => void;
  isPending: boolean;
  errors?: string[] | undefined;
};

const MAX_LINKS = 8;
function makeEmpty(): ExternalLinkInput {
  return {
    _key: crypto.randomUUID(),
    url: "",
    title: "",
    description: null,
    imageUrl: null,
  };
}

export function ExternalLinksField({
  links,
  onChange,
  isPending,
  errors,
}: ExternalLinksFieldProps): ReactElement {
  function updateLink(index: number, patch: Partial<ExternalLinkInput>): void {
    onChange(links.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLink(index: number): void {
    onChange(links.filter((_, i) => i !== index));
  }
  function addLink(): void {
    if (links.length >= MAX_LINKS) return;
    onChange([...links, makeEmpty()]);
  }
  function moveLink(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>関連リンク（外部記事 / 外部サイト）</CardTitle>
        <p className="text-sm text-muted-foreground">
          メディア掲載記事・公式サイト・参考リンク等を最大 8 件登録できます。
          公開ページでは <code className="font-mono text-xs">↗</code>{" "}
          アイコン付きで「関連リンク」セクションに表示され、{""}
          <code className="font-mono text-xs">
            rel="nofollow noreferrer"
          </code>{" "}
          が自動付与されます（SEO penalty 回避 + プライバシー保護）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            外部リンクが登録されていません。下の「リンクを追加」ボタンから作成してください。
          </p>
        ) : (
          links.map((link, index) => {
            const base = `event-external-link-${index}`;
            return (
              <div
                key={link._key ?? `idx-${index}`}
                className="space-y-3 rounded-md border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <IconExternalLink className="h-4 w-4" aria-hidden />#
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveLink(index, -1)}
                      disabled={isPending || index === 0}
                      aria-label="上へ移動"
                    >
                      <IconChevronUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveLink(index, 1)}
                      disabled={isPending || index === links.length - 1}
                      aria-label="下へ移動"
                    >
                      <IconChevronDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => removeLink(index)}
                      disabled={isPending}
                      aria-label="削除"
                    >
                      <IconTrash className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor={`${base}-url`}>URL *</Label>
                    <Input
                      id={`${base}-url`}
                      type="url"
                      inputMode="url"
                      value={link.url}
                      onChange={(e) =>
                        updateLink(index, { url: e.target.value })
                      }
                      placeholder="https://example.com/article"
                      disabled={isPending}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${base}-title`}>タイトル *</Label>
                    <Input
                      id={`${base}-title`}
                      type="text"
                      value={link.title}
                      onChange={(e) =>
                        updateLink(index, { title: e.target.value })
                      }
                      placeholder="例: 〇〇メディアに掲載されました"
                      disabled={isPending}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${base}-description`}>説明 (任意)</Label>
                    <Input
                      id={`${base}-description`}
                      type="text"
                      value={link.description ?? ""}
                      onChange={(e) =>
                        updateLink(index, {
                          description:
                            e.target.value === "" ? null : e.target.value,
                        })
                      }
                      placeholder="リンク先の概要・媒体名など"
                      disabled={isPending}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${base}-imageUrl`}>
                      プレビュー画像 URL (任意)
                    </Label>
                    <Input
                      id={`${base}-imageUrl`}
                      type="url"
                      inputMode="url"
                      value={link.imageUrl ?? ""}
                      onChange={(e) =>
                        updateLink(index, {
                          imageUrl:
                            e.target.value === "" ? null : e.target.value,
                        })
                      }
                      placeholder="https://example.com/og-image.jpg"
                      disabled={isPending}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      未入力時はテキストカードで表示されます。
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        <Button
          type="button"
          variant="outline"
          onClick={addLink}
          disabled={isPending || links.length >= MAX_LINKS}
        >
          <IconPlus className="h-4 w-4" aria-hidden />
          リンクを追加
        </Button>
        {links.length >= MAX_LINKS && (
          <p className="text-xs text-warning">
            外部リンクは最大 {MAX_LINKS} 件まで登録できます。
          </p>
        )}

        {errors && errors.length > 0 && (
          <p className="text-sm text-destructive" role="alert">
            {errors.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
