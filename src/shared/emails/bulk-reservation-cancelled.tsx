import { Hr, Section, Text } from "@react-email/components";
import { bulkReservationCancelledFixture } from "./bulk-reservation-cancelled.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  heading,
  hr,
  text,
} from "./_shared/styles";

/** 1 instance（date + time 済み文字列）表示用の最小単位。 */
export type BulkReservationCancelledInstance = {
  date: string;
  time: string;
};

type Props = {
  customerName: string;
  /** series の代表表示名（Phase B.2 現状はスペース名をそのまま使う）。 */
  seriesTitle: string;
  instanceCount: number;
  reservationList: BulkReservationCancelledInstance[];
  /** キャンセル理由（未入力なら省略）。 */
  reason?: string;
  footer: EmailFooterData;
};

/**
 * Phase B.2 task 12: 定期予約（series）一括キャンセルの集約通知メール skeleton。
 *
 * 顧客向け・管理者向けの両方でこの 1 テンプレートを共有する
 * （`sendBulkReservationCancelledEmail` / `sendBulkAdminNotification`、
 * `src/shared/lib/email/reservation-emails.ts`）。文言・レイアウトの最終調整は
 * Task 27 で行う。
 */
export function BulkReservationCancelledEmail({
  customerName,
  seriesTitle,
  instanceCount,
  reservationList,
  reason,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`定期予約キャンセルのお知らせ - ${seriesTitle}（${String(instanceCount)}件）`}
      footer={footer}
    >
      <Text style={heading}>定期予約キャンセルのお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        {seriesTitle} の定期予約のうち、以下 {instanceCount}{" "}
        件がキャンセルされました。
      </Text>

      <Section
        style={{
          backgroundColor: danger.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: danger.heading }}>
          キャンセルされた日程
        </Text>
        <Hr style={hr} />
        {reservationList.map((instance) => (
          <Text key={`${instance.date}_${instance.time}`} style={detailItem}>
            {instance.date} {instance.time}
          </Text>
        ))}
      </Section>

      {reason && (
        <Text style={text}>
          <strong>キャンセル理由:</strong> {reason}
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

BulkReservationCancelledEmail.PreviewProps = bulkReservationCancelledFixture;

export default BulkReservationCancelledEmail;
