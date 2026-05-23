/**
 * VideoPlayer — R2 / YouTube / Vimeo URL を自動 dispatch する primitive
 *
 * URL pattern を `detectVideoProvider()` で判定:
 * - YouTube / Vimeo → `<iframe>` 埋め込み（Cloudflare CDN 透過、oEmbed 不要）
 * - R2 / 任意 mp4 → HTML5 `<video controls poster>`
 *
 * 業界標準: WordPress Video Block / Webflow / Squarespace と同型 URL ベース dispatch。
 *
 * Hero 背景動画用途には `variant="background"` を指定:
 * - 自動再生 + ループ + ミュート + コントロール非表示
 * - YouTube/Vimeo は iframe query parameter (`autoplay=1&mute=1&loop=1&controls=0`) で再現
 *
 * `controls` variant (default) は通常の埋め込み再生プレイヤー。
 *
 * このコンポーネントは pure render で server-only 依存を持たない。Server / Client
 * いずれの境界からも import 可能（Hero 等の Client Component 経由でも安全に使える）。
 */

import { detectVideoProvider } from "@/shared/lib/video/url-detect";
import { cn } from "@/shared/lib/cn";

export type VideoPlayerVariant = "background" | "controls";

interface VideoPlayerProps {
  readonly url: string;
  readonly title?: string;
  readonly poster?: string;
  readonly variant?: VideoPlayerVariant;
  readonly className?: string;
}

function buildYouTubeEmbedSrc(
  videoId: string,
  variant: VideoPlayerVariant,
): string {
  const base = `https://www.youtube.com/embed/${videoId}`;
  if (variant !== "background") return base;
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    controls: "0",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    playlist: videoId,
  });
  return `${base}?${params.toString()}`;
}

function buildVimeoEmbedSrc(
  videoId: string,
  variant: VideoPlayerVariant,
): string {
  const base = `https://player.vimeo.com/video/${videoId}`;
  if (variant !== "background") return base;
  const params = new URLSearchParams({
    autoplay: "1",
    muted: "1",
    loop: "1",
    background: "1",
  });
  return `${base}?${params.toString()}`;
}

export function VideoPlayer({
  url,
  title,
  poster,
  variant = "controls",
  className,
}: VideoPlayerProps) {
  if (url.length === 0) return null;

  // R2 vs external source 判別は render dispatch には不要（provider 有無のみで充分）。
  // source field を要する用途 (admin プレビュー等) は detectVideoProvider を直接呼ぶ。
  const detection = detectVideoProvider(url);

  if (detection.provider === "youtube" && detection.videoId) {
    return (
      <iframe
        src={buildYouTubeEmbedSrc(detection.videoId, variant)}
        title={title ?? "YouTube 動画"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className={cn("h-full w-full border-0", className)}
      />
    );
  }

  if (detection.provider === "vimeo" && detection.videoId) {
    return (
      <iframe
        src={buildVimeoEmbedSrc(detection.videoId, variant)}
        title={title ?? "Vimeo 動画"}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className={cn("h-full w-full border-0", className)}
      />
    );
  }

  // R2 self-host または任意 mp4 URL
  if (variant === "background") {
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        {...(poster !== undefined && { poster })}
        className={cn("h-full w-full object-cover", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <video
      src={url}
      controls
      preload="metadata"
      {...(poster !== undefined && { poster })}
      className={cn("h-full w-full bg-foreground", className)}
      {...(title !== undefined && { "aria-label": title })}
    />
  );
}
