import { Hr, Section, Text } from "@react-email/components";
import { reviewReplyFixture } from "./review-reply.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  messageText,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  spaceName: string;
  rating: number;
  originalTitle: string | null;
  originalComment: string | null;
  replyBody: string;
  footer: EmailFooterData;
};

const messageBox = {
  ...messageText,
  backgroundColor: COLOR.surface,
  padding: "12px",
  borderRadius: "4px",
  border: `1px solid ${COLOR.border}`,
};

function renderStars(rating: number): string {
  const filled = "★".repeat(Math.max(0, Math.min(5, rating)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.min(5, rating)));
  return `${filled}${empty}`;
}

export function ReviewReplyEmail({
  customerName,
  spaceName,
  rating,
  originalTitle,
  originalComment,
  replyBody,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`【${spaceName}】レビューへのお返事が届きました`}
      footer={footer}
    >
      <Text style={heading}>レビューへのお返事</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        この度は「{spaceName}」にレビューをご投稿いただき、
        誠にありがとうございます。以下の通りお返事いたします。
      </Text>

      <Section
        style={{
          backgroundColor: info.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: info.heading }}>
          お店からのお返事
        </Text>
        <Hr style={hr} />
        <Text style={messageBox}>{replyBody}</Text>
      </Section>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お客様のレビュー</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        <Text style={detailItem} aria-label={`評価 ${rating} / 5`}>
          <strong>評価:</strong> {renderStars(rating)} ({rating}/5)
        </Text>
        {originalTitle ? (
          <Text style={detailItem}>
            <strong>タイトル:</strong> {originalTitle}
          </Text>
        ) : null}
        {originalComment ? (
          <>
            <Text style={detailItem}>
              <strong>コメント:</strong>
            </Text>
            <Text style={messageBox}>{originalComment}</Text>
          </>
        ) : null}
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        今後ともご愛顧のほど、よろしくお願い申し上げます。
      </Text>
    </EmailLayout>
  );
}

ReviewReplyEmail.PreviewProps = reviewReplyFixture;

export default ReviewReplyEmail;
