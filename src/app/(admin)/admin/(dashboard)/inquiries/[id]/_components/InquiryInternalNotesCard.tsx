"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import {
  createInquiryInternalNote,
  deleteInquiryInternalNote,
} from "@/admin/actions/inquiry/ops";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { InquiryInternalNoteItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

type InquiryInternalNotesCardProps = {
  inquiryId: string;
  notes: Serialized<InquiryInternalNoteItem>[];
  currentUserId: string;
  canDeleteOthersNotes: boolean;
};

export function InquiryInternalNotesCard({
  inquiryId,
  notes,
  currentUserId,
  canDeleteOthersNotes,
}: InquiryInternalNotesCardProps) {
  const [body, setBody] = useState("");
  const [isCreating, startCreateTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();

  const handleCreate = () => {
    startCreateTransition(async () => {
      const result = await createInquiryInternalNote(inquiryId, body);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("メモを追加しました");
        setBody("");
        router.refresh();
      }
    });
  };

  const handleDelete = (noteId: string) => {
    setDeletingId(noteId);
    startDeleteTransition(async () => {
      const result = await deleteInquiryInternalNote(inquiryId, noteId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("メモを削除しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>内部メモ（顧客には表示されません）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {notes.length > 0 ? (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-md border bg-muted/30 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  {(note.authorId === currentUserId ||
                    canDeleteOthersNotes) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="メモを削除"
                      disabled={isDeleting && deletingId === note.id}
                      onClick={() => handleDelete(note.id)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.authorName ?? "スタッフ"} ・{" "}
                  {formatDateTimeShort(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">メモはありません</p>
        )}

        <div className="space-y-2">
          <Textarea
            placeholder="内部メモを入力..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            disabled={isCreating}
          />
          <div className="flex justify-end">
            <SubmitButton
              isPending={isCreating}
              label="メモを追加"
              pendingLabel="追加中..."
              disabled={!body.trim()}
              onClick={handleCreate}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
