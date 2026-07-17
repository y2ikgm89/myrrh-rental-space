import { Hr, Link, Section, Text } from "@react-email/components";
import { eventBroadcastFixture } from "./event-broadcast.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  /** イベント名（見出し・詳細セクションの参照用） */
  eventTitle: string;
  /** イベント詳細ページ URL（本文末尾のリンクとして提示） */
  eventUrl: string;
  /** 管理者が入力した件名。本メールの subject にも使う */
  subject: string;
  /**
   * 管理者が入力した本文（plain text）。
   * 参加者共通 body として送るため、customerName プレースホルダは含めない。
   * `whiteSpace: "pre-wrap"` で改行を保持して描画する。
   */
  bodyText: string;
  footer: EmailFooterData;
};

/**
 * 管理者オーサリング型 event broadcast (T12)
 *
 * 参加者全員に共通の件名・本文を送るテンプレート。
 * 自動発火型（`event-cancelled-notification` / `event-updated-notification`）と異なり、
 * 予定変更や中止といった構造化された情報ではなく、管理者が任意の連絡文を編集して
 * 参加者に送信する用途で使う（会場変更のリマインド、雨天時の持ち物案内、当日の
 * 集合時間補足、etc.）。
 *
 * customerName を含めない設計上の判断: 送信対象共通 body として同一 render 結果を
 * 全宛先に fan-out するため、`Promise.allSettled` で mapping する呼出側が Recipient
 * 単位で React tree を作り直さずに済む。個別署名が必要なユースケースは将来別テンプレで
 * 対応する（この template は「全員宛の一斉配信」を SSoT とする）。
 */
export function EventBroadcastEmail({
  eventTitle,
  eventUrl,
  subject,
  bodyText,
  footer,
}: Props) {
  return (
    <EmailLayout preview={subject} footer={footer}>
      <Text style={heading}>{subject}</Text>

      <Text style={text}>
        {eventTitle}{" "}
        にお申し込みいただいた皆さまへ、運営より下記のお知らせをお送りします。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お知らせ内容</Text>
        <Hr style={hr} />
        <Text style={{ ...text, whiteSpace: "pre-wrap", margin: 0 }}>
          {bodyText}
        </Text>
      </Section>

      <Section>
        <Text style={detailItem}>
          <strong>対象イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <Link
            href={eventUrl}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            イベント詳細ページを開く
          </Link>
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、本メールへ返信いただくかお問い合わせフォームよりご連絡ください。
      </Text>
    </EmailLayout>
  );
}

EventBroadcastEmail.PreviewProps = eventBroadcastFixture;

export default EventBroadcastEmail;
