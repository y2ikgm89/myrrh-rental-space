import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { formatDate } from "@/shared/lib/date-format";
import type { InquiryReplyItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

function getReplyAuthorTypeLabel(
  authorType: InquiryReplyItem["authorType"],
): string {
  switch (authorType) {
    case "STAFF":
      return "スタッフ";
    case "CUSTOMER":
      return "お客様";
    default: {
      const _exhaustive: never = authorType;
      throw new Error(`Unknown authorType: ${String(_exhaustive)}`);
    }
  }
}

type InquiryThreadProps = {
  message: string;
  replies: Serialized<InquiryReplyItem>[];
};

export function InquiryThread({ message, replies }: InquiryThreadProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            お問い合わせ内容
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{message}</p>
        </CardContent>
      </Card>

      {replies.map((reply) => {
        const authorTypeLabel = getReplyAuthorTypeLabel(reply.authorType);
        return (
          <Card key={reply.id}>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {authorTypeLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="whitespace-pre-wrap">{reply.body}</p>
              <p className="text-xs text-muted-foreground">
                {reply.authorName ?? authorTypeLabel} -{" "}
                {formatDate(reply.createdAt, true)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
