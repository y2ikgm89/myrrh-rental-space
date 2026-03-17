import type { HomepageContent } from "../schemas";

export const defaultHomepageContent: HomepageContent = {
  hero: {
    title: "Myrrh Rental Space",
    subtitle: "特別な空間で、特別な時間を",
    image: {
      src: "/images/hero-default.jpg",
      alt: "Myrrh Rental Space ヒーロー画像",
      width: 1920,
      height: 1080,
    },
    cta: { label: "スペースを見る", href: "/spaces", variant: "primary" },
  },
  concept: {
    label: "CONCEPT",
    heading: "私たちの想い",
    body: "Myrrh Rental Space は、撮影、会議、イベント、ワークショップなど、あらゆるシーンに対応する上質なレンタルスペースです。洗練された空間と柔軟なプランで、特別な瞬間をサポートします。",
    image: {
      src: "/images/concept-default.jpg",
      alt: "コンセプトイメージ",
      width: 800,
      height: 600,
    },
  },
  features: {
    label: "FEATURES",
    heading: "Myrrh の特徴",
    items: [
      {
        icon: "Sparkles",
        title: "洗練された空間",
        description:
          "細部までこだわった上質な内装で、ブランドイメージにふさわしい空間を提供します",
      },
      {
        icon: "Clock",
        title: "柔軟な利用時間",
        description:
          "1時間単位からご利用いただけます。早朝・深夜のご予約もご相談ください",
      },
      {
        icon: "Shield",
        title: "安心のサポート",
        description: "専任スタッフが準備から撤収まで丁寧にご対応いたします",
      },
    ],
  },
  cta: {
    heading: "ご予約・お問い合わせ",
    body: "お気軽にご相談ください。見学のご予約も承っております。",
    buttons: [
      { label: "予約する", href: "/reservation", variant: "primary" },
      { label: "お問い合わせ", href: "/contact", variant: "secondary" },
    ],
  },
};
