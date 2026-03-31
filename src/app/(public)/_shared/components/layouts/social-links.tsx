import type { ReactElement } from "react";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBrandX,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandYoutube,
  IconBrandLine,
  IconBrandTiktok,
  IconExternalLink,
} from "@tabler/icons-react";
import type { SocialLinkForFooter } from "@/shared/domain/settings/queries/organization";

// =============================================================================
// Platform Icons（@tabler/icons-react ブランドアイコン）
// =============================================================================

const PLATFORM_ICONS: Record<string, TablerIcon> = {
  TWITTER: IconBrandX,
  FACEBOOK: IconBrandFacebook,
  INSTAGRAM: IconBrandInstagram,
  YOUTUBE: IconBrandYoutube,
  LINE: IconBrandLine,
  TIKTOK: IconBrandTiktok,
  OTHER: IconExternalLink,
};

const PLATFORM_LABELS: Record<string, string> = {
  TWITTER: "X (Twitter)",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  LINE: "LINE",
  TIKTOK: "TikTok",
  OTHER: "外部サイト",
};

// =============================================================================
// Component
// =============================================================================

interface SocialLinksProps {
  links: SocialLinkForFooter[];
}

export function SocialLinks({ links }: SocialLinksProps): ReactElement | null {
  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {links.map((link) => {
        const Icon = PLATFORM_ICONS[link.platform];
        const label = PLATFORM_LABELS[link.platform] ?? link.platform;

        // デバイス別表示制御
        const visibility =
          !link.showOnDesktop && link.showOnMobile
            ? "lg:hidden"
            : link.showOnDesktop && !link.showOnMobile
              ? "hidden lg:inline-flex"
              : !link.showOnDesktop && !link.showOnMobile
                ? "hidden"
                : undefined;

        return (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-muted-foreground transition-colors hover:text-foreground${visibility ? ` ${visibility}` : ""}`}
            aria-label={label}
          >
            {Icon ? (
              <Icon className="h-5 w-5" />
            ) : (
              <span className="text-xs">{label}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
