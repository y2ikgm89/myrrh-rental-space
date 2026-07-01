/**
 * PWA Icon 512x512 — Dynamic Route Handler
 *
 * ImageResponse で動的にPWAアイコンを生成。
 * 公開 Web App Manifest の icons から参照される。
 */

import { ImageResponse } from "next/og";

export function GET() {
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
          fontSize: 256,
          fontWeight: 700,
          color: "#8c7a5e",
          letterSpacing: "0.05em",
        }}
      >
        M
      </div>
    </div>,
    {
      width: 512,
      height: 512,
    },
  );
}
