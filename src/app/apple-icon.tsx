/**
 * Apple Touch Icon — Dynamic Generation
 *
 * Next.js ファイルコンベンションで自動的に <link rel="apple-touch-icon"> を生成。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
 */

import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fafafa 0%, #f0ece4 100%)",
        fontFamily: "serif",
      }}
    >
      <div
        style={{
          fontSize: 96,
          fontWeight: 700,
          color: "#8c7a5e",
          letterSpacing: "0.05em",
        }}
      >
        M
      </div>
    </div>,
    { ...size },
  );
}
