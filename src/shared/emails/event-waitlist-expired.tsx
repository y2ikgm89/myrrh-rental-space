import { Button, Hr, Section, Text } from "@react-email/components";
import { eventWaitlistExpiredFixture } from "./event-waitlist-expired.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  buttonPrimary,
  buttonSection,
  heading,
  hr,
  text,
  urlFallbackText,
} from "./_shared/styles";

type Props = {
  customerName: string;
  eventTitle: string;
  /** 再申込導線: イベント詳細ページの URL */
  eventUrl: string;
  footer: EmailFooterData;
};

export function EventWaitlistExpiredEmail({
  customerName,
  eventTitle,
  eventUrl,
  footer,
}: Props) {
  return (
    <EmailLayout
      preview={`繰り上げ当選の期限切れ - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>繰り上げ当選の期限切れ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        誠に残念ながら、以下のイベントについて繰り上げ当選のお手続き期限内に
        ご確認が取れなかったため、参加の権利が失効し、キャンセル待ちの次に
        お待ちのお客様にご案内いたしました。
      </Text>

      <Text style={text}>
        <strong>{eventTitle}</strong>
      </Text>

      <Text style={text}>
        引き続きご参加をご希望の場合は、下記よりイベント詳細ページから
        再度キャンセル待ちにお申込みいただけます。
      </Text>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={eventUrl}>
          イベント詳細を見る
        </Button>
      </Section>

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{eventUrl}</Text>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

EventWaitlistExpiredEmail.PreviewProps = eventWaitlistExpiredFixture;

export default EventWaitlistExpiredEmail;
