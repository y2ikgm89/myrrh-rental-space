"use client";

import { useEffect, useRef } from "react";
import { consumeSignupTermsAction } from "@/app/(public)/_shared/actions/consume-signup-terms";

interface SignupTermsConsumerProps {
  readonly isNew: boolean;
}

/**
 * mypage 初期表示で signup 同意 cookie を消費する fire-and-forget client component。
 *
 * 役割（公式準拠の cookie mutation 隔離）:
 *   Server Component から cookie set/delete は Next.js 公式に禁止されている。本 component が
 *   mount 直後に Server Action を 1 回だけ呼ぶことで、cookie 削除 + 規約同意記録を Server Action
 *   context で実行する。
 *
 * 表示しないため return null。
 */
export function SignupTermsConsumer({ isNew }: SignupTermsConsumerProps): null {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void consumeSignupTermsAction({ isNew });
  }, [isNew]);

  return null;
}
