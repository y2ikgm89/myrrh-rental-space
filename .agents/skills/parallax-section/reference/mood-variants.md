# ムードバリアント & インテンシティダイアル詳細リファレンス

> ムード→アニメーション/ビジュアル完全マッピング、インテンシティダイアル、モバイルスケーリング

## インテンシティダイアル

テンプレートのパラメータをLow/Medium/Highの3段階で調整。ムードに応じて選択。

| パラメータ | Low（控えめ） | Medium（標準） | High（大胆） |
|-----------|-------------|--------------|------------|
| パララックス yPercent | ±5〜10 | ±15〜25 | ±30〜50 |
| 入場 duration | 0.4〜0.6s | 0.7〜1.0s | 1.2〜2.0s |
| 入場 y距離 | 15〜25px | 30〜50px | 60〜100px |
| stagger | 0.06〜0.10 | 0.10〜0.18 | 0.20〜0.50 |
| scrub範囲 | start→end 短い | 中程度 | 長いスクロール距離 |
| scale変化 | 0.97〜1.0 | 0.90〜1.0 | 0.80〜1.0 |
| clipPath inset | 5%〜10% | 15%〜25% | 30%〜50% |
| opacity初期値 | 0.6 | 0.3 | 0 |
| 回転量 | 0〜2deg | 3〜8deg | 10〜30deg |
| イージング強度 | power1〜2 | power2〜3 | power4, expo, elastic |

### 用途ガイド

| インテンシティ | 適合するムード | 適合するプロダクト |
|-------------|-------------|----------------|
| **Low** | コーポレート、エレガント | B2B SaaS、医療、金融、法律 |
| **Medium** | エディトリアル、オーガニック、ラグジュアリー | ホスピタリティ、不動産、レストラン |
| **High** | ドラマチック、プレイフル、ブルータリスト | エンタメ、ファッション、アート、ゲーム |

## モバイルスケーリングルール

モバイルではインテンシティを自動で1段階下げる:
- High → Medium相当（パララックス量・duration・距離を削減）
- Medium → Low相当
- Low → そのまま（これ以上削減しない）

実装: `gsap.matchMedia()` のモバイル分岐でパラメータに応じて40-80%に縮小（下表参照）。

### パラメータ別スケーリング

| パラメータ | デスクトップ値 | モバイル変換 | 備考 |
|-----------|-------------|-----------|------|
| yPercent | 原値 | × 0.4〜0.5 | 小画面では視差が目立ちすぎる |
| 入場 y距離 | 原値 | × 0.6〜0.7 | 画面が小さいので距離も短縮 |
| stagger | 原値 | × 0.7 | 待ち時間を短縮 |
| 入場 duration | 原値 | × 0.8 | やや短縮（ユーザーの忍耐度） |
| scale変化 | 原値 | 初期値を1.0に近づける | モバイルでは大きなscale変化が不自然 |
| clipPath inset | 原値 | × 0.5 | 小画面では控えめに |
| 回転量 | 原値 | × 0.5 | 小画面では回転が目立つ |
| レイヤー数 | 5層 | 3層 | パフォーマンス確保 |
| pin固定 | 使用可 | **回避** | iOS Safariとの互換性 |
| data-speed | 原値 | `1 + (speed - 1) * 0.3` | 視差を大幅に圧縮 |

### matchMedia 実装パターン

```typescript
const mm = gsap.matchMedia()
mm.add({
  isDesktop: '(min-width: 800px)',
  isMobile: '(max-width: 799px)',
}, (context) => {
  const { isDesktop, isMobile } = context.conditions!

  // パララックス量
  const parallaxAmount = isDesktop ? 30 : 12   // 40%に縮小

  // 入場パラメータ
  const entryY = isDesktop ? 50 : 30           // 60%に縮小
  const entryDuration = isDesktop ? 1.0 : 0.8  // 80%に縮小
  const entryStagger = isDesktop ? 0.15 : 0.10 // 67%に縮小

  // レイヤー
  const layerCount = isDesktop ? 5 : 3

  // ピン固定
  if (isDesktop) {
    ScrollTrigger.create({ trigger: section, pin: true, ... })
  }
  // モバイル: ピンなし、scroll-snap で代替
})
```

## ムード×タイプ組み合わせ推奨

### hero タイプ

| ムード | 推奨インテンシティ | 特殊効果 | 注意事項 |
|--------|-----------------|---------|---------|
| ドラマチック | High | SplitText char + rotateX, 5層 | LCP注意（Hero画像を`fetchpriority="high"`） |
| エレガント | Medium | line mask reveal, 3層 | 余白を多めに、padding増加 |
| プレイフル | Medium-High | char + scale + bounce, 5層 | stagger過多に注意（0.12以下） |
| コーポレート | Low | toggleActions（1回入場のみ） | パララックスは背景のみ |
| ラグジュアリー | Medium | blur(8→0) + vignette, 3層 | PixiJS L4で質感追加 |

### content タイプ

| ムード | 推奨インテンシティ | clipPath | 画像処理 |
|--------|-----------------|---------|---------|
| ドラマチック | High | 30% inset, `power3.inOut` | scale 1.20, yPercent ±15 |
| エレガント | Low-Medium | 10% inset, `power2.inOut` | scale 1.10, yPercent ±8 |
| エディトリアル | Medium | inset(0 100% 0 0) 横リビール | scale 1.12, yPercent ±10 |
| オーガニック | Medium | circle(0% at 50% 50%) 円形 | scale 1.15, yPercent ±12 |

### stacking タイプ

| ムード | 推奨インテンシティ | セクション間効果 | 背景遷移 |
|--------|-----------------|---------------|---------|
| ドラマチック | High | blur(4→0) + scale(0.90) | 色相回転（HSLアニメーション） |
| エレガント | Medium | opacity(0.4) + scale(0.97) | 明度変化（白→テーマ色） |
| ラグジュアリー | Medium | opacity(0.3) + scale(0.95) + blur(2→0) | 暗→暗（アクセント色変化） |

### gallery タイプ

| ムード | 推奨インテンシティ | グリッド | offset範囲 |
|--------|-----------------|--------|-----------|
| ドラマチック | High | フルブリード、3列 | ±50px |
| エディトリアル | Medium | マガジン風、混合サイズ | ±20px |
| プレイフル | High | 壊れたグリッド、回転 | ±40px + rotate(±5deg) |
| ミニマル | Low | 均等3列、オフセットなし | 0px |

## ムード×エフェクトレベル マトリクス

| ムード | L1 (CSS) | L2 (GSAP) | L3 (Three.js) | L4 (PixiJS) |
|--------|----------|-----------|-------------|------------|
| **ドラマチック** | CSS transition + clip-path | GSAP parallax + SplitText | ParticleField + Bloom | Grain + Vignette |
| **エレガント** | CSS fade-in + backdrop-blur | GSAP smooth parallax | Soft particles | Light grain |
| **プレイフル** | CSS @keyframes bounce | GSAP elastic + snap | Colorful particles | ChromaticAberration |
| **コーポレート** | CSS transition のみ | GSAP toggleActions | なし（不要） | なし |
| **ブルータリスト** | CSS steps() + glitch | GSAP sharp transitions | Wireframe + noise | Scanline + Grain |
| **ラグジュアリー** | CSS blur + gradient | GSAP smooth + slow | Glass material | Grain + Blur + Vignette |

各セルの組み合わせは、対応するルールファイル参照:
- L1: `docs/reference/codex-rules/visual-effects-patterns.md` (CSSエフェクトカタログ)
- L2: `docs/reference/codex-rules/gsap-patterns.md`
- L3: `docs/reference/codex-rules/threejs-patterns.md`
- L4: `docs/reference/codex-rules/pixijs-patterns.md`

## Three.js ムード別エンハンスメント

| ムード | Three.js コンポーネント | パーティクル設定 | ポストプロセス |
|--------|----------------------|----------------|-------------|
| **ドラマチック** | ParticleField(200) + FloatingGeometry | 大きめ(0.04), 高速(speed:2) | Bloom(0.8) + ChromaticAberration(0.003) |
| **エレガント** | ParticleField(60) | 小さめ(0.015), 低速(speed:0.5) | DOF(bokehScale:4) + Bloom(0.2) |
| **プレイフル** | FloatingGeometry(colorful) + Sparkles | 中サイズ(0.03), バウンス | ChromaticAberration(0.005) |
| **コーポレート** | なし（L2で十分） | — | — |
| **オーガニック** | ParticleField(80) + WavePlane | 不規則サイズ, ゆっくり | Noise(0.03) + Bloom(0.3) |
| **ブルータリスト** | FloatingGeometry(wireframe) | 角ばったジオメトリ | Noise(0.05) + ChromaticAberration(0.008) |
| **エディトリアル** | ParticleField(40) | 極小(0.01), 控えめ | Noise(0.02) |
| **ラグジュアリー** | ParticleField(40) + Glass material | 極小(0.01), 超低速(speed:0.3) | DOF(bokehScale:6) + Bloom(0.4) |

## PixiJS フィルター ムード別設定

| ムード | Grain | Vignette | 追加フィルター | 備考 |
|--------|-------|----------|-------------|------|
| **ドラマチック** | 0.06 | intensity:0.35, radius:0.6 | — | 強いコントラスト、映画的 |
| **エレガント** | 0.03 | intensity:0.20, radius:0.8 | — | 控えめ、上品 |
| **プレイフル** | 0.02 | intensity:0.15, radius:0.85 | ChromaticAberration(0.003) | 彩度高め |
| **コーポレート** | — | — | — | PixiJS不要（L4不要） |
| **オーガニック** | 0.04 | intensity:0.25, radius:0.75 | Displacement(0.02) | テクスチャ感 |
| **ブルータリスト** | 0.08 | intensity:0.30, radius:0.65 | Scanline(count:400, intensity:0.06) | CRT感、ザラつき |
| **エディトリアル** | 0.04 | intensity:0.22, radius:0.78 | — | 紙質感 |
| **ラグジュアリー** | 0.04 | intensity:0.25, radius:0.75 | Blur(1.5) | 映画的ボケ感 |
