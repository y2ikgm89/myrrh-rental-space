import { Hr, Link, Section, Text } from "@react-email/components";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { reservationConfirmationFixture } from "./reservation-confirmation.fixture";
import { CalendarLinks } from "./_shared/CalendarLinks";
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
  linkDangerStyle,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  notes?: string;
  addToCalendarLinks?: AddToCalendarUrls;
  /** ゲスト向け: 期限内のみ生成される暗号化トークン付き URL */
  cancelUrl?: string;
  /** 会員向け: ログイン後の予約詳細ページ URL（マイページから取消・変更可能） */
  memberReservationUrl?: string;
  /** ゲスト向け: マイページに予約を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
  /** キャンセル受付期限の時間数（予約開始の X 時間前まで） */
  cancellationDeadlineHours?: number;
  /** 変更受付期限の時間数（予約開始の X 時間前まで）。キャンセルと独立に設定可能 */
  modificationDeadlineHours?: number;
  /** 公開中のキャンセルポリシー規約 URL。無ければ本文はプレーンテキストにフォールバックする */
  cancellationPolicyUrl?: string;
  /** 予約確定時に発行されたスマートロックの一時パスコード一覧 */
  smartLockPasscodes?: { deviceName: string; passcode: string }[];
  /**
   * スマートロックのパスコード発行が失敗した際の代替入室手段案内 (PR#12)。
   * true のとき「当日運営までお問い合わせください」の fallback セクションを描画。
   * smartLockPasscodes を渡さず (発行なし) `smartLockIssuanceFailed=true` を渡すと
   * 「本来発行される予定だったが失敗した」ケースを明示できる。
   */
  smartLockIssuanceFailed?: boolean;
  /** 発行失敗時に案内する連絡先。null の場合は sender 情報にフォールバック。 */
  smartLockFallbackContact?: {
    readonly phone?: string | null;
    readonly email?: string | null;
  };
  footer: EmailFooterData;
};

export function ReservationConfirmationEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  notes,
  addToCalendarLinks,
  cancelUrl,
  memberReservationUrl,
  claimUrl,
  cancellationDeadlineHours,
  modificationDeadlineHours,
  cancellationPolicyUrl,
  smartLockPasscodes,
  smartLockIssuanceFailed,
  smartLockFallbackContact,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`ご予約ありがとうございます - ${spaceName}`}
      footer={footer}
    >
      <Text style={heading}>ご予約確認</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        この度はご予約いただき、誠にありがとうございます。
        以下の内容でご予約を承りました。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>予約番号:</strong> {reservationId}
        </Text>
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {reservationDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>料金:</strong> {totalPrice}
        </Text>
        {notes && (
          <Text style={detailItem}>
            <strong>備考:</strong> {notes}
          </Text>
        )}
      </Section>

      {addToCalendarLinks && <CalendarLinks links={addToCalendarLinks} />}

      {smartLockPasscodes && smartLockPasscodes.length > 0 && (
        <Section style={detailsSection}>
          <Text style={detailsHeading}>スマートロック解錠用の暗証番号</Text>
          <Hr style={hr} />
          {smartLockPasscodes.map((entry) => (
            <Text
              key={`${entry.deviceName}-${entry.passcode}`}
              style={detailItem}
            >
              <strong>{entry.deviceName}:</strong> {entry.passcode}
            </Text>
          ))}
        </Section>
      )}

      {/* スマートロック発行失敗時の代替入室手段案内 (PR#12) */}
      {smartLockIssuanceFailed && (
        <Section
          style={{
            backgroundColor: danger.background,
            borderRadius: "4px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: danger.heading,
              marginBottom: "8px",
            }}
          >
            スマートロックの暗証番号発行について
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            現在システムでの暗証番号の自動発行に失敗しております。当日のご入室に
            つきましては、下記までお問い合わせください。ご不便をおかけして申し訳
            ございません。
          </Text>
          {smartLockFallbackContact?.phone && (
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "24px",
                marginTop: "8px",
              }}
            >
              <strong>お電話:</strong> {smartLockFallbackContact.phone}
            </Text>
          )}
          {smartLockFallbackContact?.email && (
            <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
              <strong>メール:</strong> {smartLockFallbackContact.email}
            </Text>
          )}
        </Section>
      )}

      {memberReservationUrl && (
        <Section
          style={{
            backgroundColor: SECTION_VARIANT_STYLES.info.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            会員のお客様は、マイページから予約内容の変更・キャンセル・領収書の確認が
            行えます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={memberReservationUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページで予約を確認する
            </Link>
          </Text>
        </Section>
      )}

      {claimUrl && (
        <Section
          style={{
            backgroundColor: SECTION_VARIANT_STYLES.info.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            Google または LINE でログインすると、この予約をマイページに追加して
            まとめて管理できます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={claimUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページに追加する
            </Link>
          </Text>
        </Section>
      )}

      {cancelUrl && (
        <Section
          style={{
            backgroundColor: danger.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            ご予約のキャンセルは下記のリンクから行えます
            {cancellationDeadlineHours !== undefined && (
              <>（予約開始の {cancellationDeadlineHours} 時間前まで有効）</>
            )}
            。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link href={cancelUrl} style={linkDangerStyle}>
              予約をキャンセルする
            </Link>
          </Text>
        </Section>
      )}

      {cancellationDeadlineHours !== undefined && (
        <Text style={text}>
          {modificationDeadlineHours !== undefined &&
          modificationDeadlineHours !== cancellationDeadlineHours ? (
            <>
              ご予約のキャンセルは、予約開始時刻の{" "}
              <strong>{cancellationDeadlineHours} 時間前まで</strong>
              、変更は <strong>{modificationDeadlineHours} 時間前まで</strong>
              にお手続きください。
            </>
          ) : (
            <>
              ご予約のキャンセル・変更は、予約開始時刻の{" "}
              <strong>{cancellationDeadlineHours} 時間前まで</strong>
              にお手続きください。
            </>
          )}
          期限を過ぎたお取消しはキャンセル料の対象となる場合が
          ございます。詳しくは
          {cancellationPolicyUrl ? (
            <Link
              href={cancellationPolicyUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              キャンセルポリシー
            </Link>
          ) : (
            "キャンセルポリシー"
          )}
          をご確認ください。
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
        ご利用を心よりお待ちしております。
      </Text>
    </EmailLayout>
  );
}

ReservationConfirmationEmail.PreviewProps = reservationConfirmationFixture;

export default ReservationConfirmationEmail;
