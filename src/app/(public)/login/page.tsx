import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/lib/auth";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { SocialLoginButtons } from "./_components/social-login-buttons";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  return (
    <Container variant="narrow">
      <Stack gap="lg" className="py-16">
        <Heading level={1} className="text-center">
          ログイン
        </Heading>
        <p className="text-center text-muted-foreground">
          アカウントに連携して、予約の確認や変更が簡単にできます。
        </p>
        <SocialLoginButtons />
      </Stack>
    </Container>
  );
}
