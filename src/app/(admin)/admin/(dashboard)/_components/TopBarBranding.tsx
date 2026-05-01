"use client";

import { useState } from "react";
import Image from "next/image";

type TopBarBrandingProps = {
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
};

export function TopBarBranding({
  siteName,
  headerLogoUrl,
  useHeaderLogo,
}: TopBarBrandingProps) {
  const [logoError, setLogoError] = useState(false);
  const displayName = siteName || "管理画面";

  if (!useHeaderLogo || !headerLogoUrl || logoError) {
    return (
      <span className="text-lg font-semibold text-foreground">
        {displayName}
      </span>
    );
  }

  return (
    <Image
      src={headerLogoUrl}
      alt={displayName}
      width={120}
      height={32}
      className="object-contain"
      style={{ width: "auto", height: "2rem" }}
      onError={() => setLogoError(true)}
      priority
    />
  );
}
