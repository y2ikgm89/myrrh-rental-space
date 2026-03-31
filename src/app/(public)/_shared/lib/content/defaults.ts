import type { HomepageContent, SimplePageContent } from "./schemas";
import type { SpaceListContent } from "./schemas/space-list";

export const defaultAboutContent: SimplePageContent = {
  hero: {
    title: "私たちについて",
    description: "Myrrh Rental Space のコンセプトとこだわり",
  },
};

export const defaultContactContent: SimplePageContent = {
  hero: {
    title: "お問い合わせ",
    description: "ご質問・ご相談はお気軽にどうぞ",
  },
};

export const defaultFaqContent: SimplePageContent = {
  hero: {
    title: "よくある質問",
    description: "お客様からよくいただくご質問をまとめました",
  },
};

export const defaultNewsListContent: SimplePageContent = {
  hero: {
    title: "お知らせ",
    description: "Myrrh Rental Space からの最新情報をお届けします",
  },
};

export const defaultPostsListContent: SimplePageContent = {
  hero: {
    title: "ブログ",
    description: "スペース活用のヒントやイベントレポートをお届けします",
  },
};

export const defaultPrivacyContent: SimplePageContent = {
  hero: {
    title: "プライバシーポリシー",
    description: "個人情報の取り扱いについて",
  },
};

export const defaultReservationContent: SimplePageContent = {
  hero: {
    title: "ご予約",
    description: "ご希望の日時・スペースをお選びください",
  },
};

export const defaultSpaceListContent: SpaceListContent = {
  hero: {
    title: "スペース一覧",
    description: "ご利用シーンに合わせた多彩なスペースをご用意しています",
  },
};

export const defaultTermsContent: SimplePageContent = {
  hero: {
    title: "利用規約",
    description: "Myrrh Rental Space のご利用にあたっての規約です",
  },
};

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
        icon: "IconSparkles",
        title: "洗練された空間",
        description:
          "細部までこだわった上質な内装で、ブランドイメージにふさわしい空間を提供します",
      },
      {
        icon: "IconClock",
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
