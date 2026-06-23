import { Button, Hr, Section, Text } from "@react-email/components";
import { welcomeFixture } from "./welcome.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  buttonPrimary,
  buttonSection,
  heading,
  text,
  urlFallbackText,
} from "./_shared/styles";

type Props = {
  customerName: string;
  loginUrl: string;
  siteName: string;
  footer: EmailFooterData;
};

export function WelcomeEmail({
  customerName,
  loginUrl,
  siteName,
  footer,
}: Props) {
  const mypageUrl = `${loginUrl}/mypage`;

  return (
    <EmailLayout preview={`${siteName}へようこそ`} footer={footer}>
      <Text style={heading}>{siteName}へようこそ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        ご登録いただき、誠にありがとうございます。
        マイページからご予約状況の確認やお問い合わせの管理が可能です。
      </Text>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={mypageUrl}>
          マイページを開く
        </Button>
      </Section>

      <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{mypageUrl}</Text>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = welcomeFixture;

export default WelcomeEmail;
