"use client";

import { useState, useTransition, useRef } from "react";
import { useImperativeStyle } from "@/shared/lib/csp/use-imperative-style";
import { useRouter } from "next/navigation";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/shared/lib/cn";
import { badgeVariants } from "@/admin/components/ui/badge";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  createInquiryTag,
  deleteInquiryTag,
  updateInquiryTag,
} from "@/admin/actions/inquiry/tags";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { InquiryTagOption } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

const DEFAULT_COLOR = "#6366f1";

type InquiryTagManagerProps = {
  tags: Serialized<InquiryTagOption>[];
};

type EditingTag = { id: string; name: string; color: string };

function InquiryTagBadge({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useImperativeStyle(
    ref,
    color
      ? {
          backgroundColor: color,
          borderColor: "transparent",
          color: "#fff",
        }
      : {},
  );

  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant: color ? "default" : "outline" }))}
    >
      {name}
    </span>
  );
}

export function InquiryTagManager({ tags }: InquiryTagManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState(DEFAULT_COLOR);
  const [editing, setEditing] = useState<EditingTag | null>(null);
  const [deletingTag, setDeletingTag] =
    useState<Serialized<InquiryTagOption> | null>(null);

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createInquiryTag(createName, createColor);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("タグを作成しました");
      setCreateOpen(false);
      setCreateName("");
      setCreateColor(DEFAULT_COLOR);
      router.refresh();
    });
  };

  const handleUpdate = () => {
    if (!editing) return;
    startTransition(async () => {
      const result = await updateInquiryTag(
        editing.id,
        editing.name,
        editing.color,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("タグを更新しました");
      setEditing(null);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deletingTag) return;
    startTransition(async () => {
      const result = await deleteInquiryTag(deletingTag.id);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeletingTag(null);
        return;
      }
      toast.success("タグを削除しました");
      setDeletingTag(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>タグ一覧</CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm">
              <IconPlus className="mr-1 h-4 w-4" />
              新規タグ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新規タグ</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-tag-name">タグ名</Label>
                <Input
                  id="new-tag-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-tag-color">カラー</Label>
                <Input
                  id="new-tag-color"
                  type="color"
                  value={createColor}
                  onChange={(e) => setCreateColor(e.target.value)}
                  disabled={isPending}
                  className="h-11 w-20 p-1"
                />
              </div>
            </div>
            <DialogFooter>
              <SubmitButton
                isPending={isPending}
                label="作成"
                pendingLabel="作成中..."
                disabled={!createName.trim()}
                onClick={handleCreate}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {tags.length === 0 ? (
          <EmptyState message="タグが登録されていません" />
        ) : (
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タグ</TableHead>
                  <TableHead>付与件数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <InquiryTagBadge name={tag.name} color={tag.color} />
                    </TableCell>
                    <TableCell>{tag.inquiryCount}件</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${tag.name}を編集`}
                          onClick={() =>
                            setEditing({
                              id: tag.id,
                              name: tag.name,
                              color: tag.color ?? DEFAULT_COLOR,
                            })
                          }
                        >
                          <IconPencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${tag.name}を削除`}
                          disabled={tag.inquiryCount > 0}
                          title={
                            tag.inquiryCount > 0
                              ? "付与中のタグは削除できません"
                              : undefined
                          }
                          onClick={() => setDeletingTag(tag)}
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        )}
      </CardContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タグを編集</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tag-name">タグ名</Label>
                <Input
                  id="edit-tag-name"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tag-color">カラー</Label>
                <Input
                  id="edit-tag-color"
                  type="color"
                  value={editing.color}
                  onChange={(e) =>
                    setEditing({ ...editing, color: e.target.value })
                  }
                  disabled={isPending}
                  className="h-11 w-20 p-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
              disabled={!editing?.name.trim()}
              onClick={handleUpdate}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(open) => !open && setDeletingTag(null)}
        itemName={deletingTag?.name ?? ""}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </Card>
  );
}
