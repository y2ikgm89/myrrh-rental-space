"use client";

import { signIn } from "@/shared/lib/auth-client";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";

export function SocialLoginButtons() {
  return (
    <Stack gap="lg">
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() =>
          signIn.social({ provider: "google", callbackURL: "/mypage" })
        }
      >
        Googleでログイン
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() =>
          signIn.social({ provider: "line", callbackURL: "/mypage" })
        }
      >
        LINEでログイン
      </Button>
    </Stack>
  );
}
