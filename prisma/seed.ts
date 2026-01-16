/**
 * Prisma Seed Script
 *
 * 初期データを作成する
 *
 * 使用方法:
 *   bun prisma/seed.ts --admin <email> <password> [name]  # 管理者のみ
 *   bun prisma/seed.ts --demo                              # デモデータ生成
 *   bun prisma/seed.ts --all <email> <password> [name]     # 全て生成
 *
 * 例:
 *   bun prisma/seed.ts --admin admin@example.com mypassword123 "Administrator"
 *   bun prisma/seed.ts --demo
 *   bun prisma/seed.ts --all admin@example.com mypassword123
 */

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../src/generated/prisma/client/client'
import { Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'

// PostgreSQL 接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Prisma アダプター
const adapter = new PrismaPg(pool)

// Prisma Client
const prisma = new PrismaClient({
  adapter,
})

// =============================================================================
// Admin User
// =============================================================================

async function seedAdmin(email: string, password: string, name: string = 'Administrator') {
  // Better Auth のデフォルト（Scrypt）でハッシュ化
  const hashedPassword = await hashPassword(password)

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true },
  })

  if (existingUser) {
    // ユーザー更新
    await prisma.user.update({
      where: { email },
      data: {
        role: 'ADMIN',
        name,
      },
    })

    // credential account のパスワード更新 or 作成
    const credentialAccount = existingUser.accounts.find(
      (acc) => acc.providerId === 'credential'
    )
    if (credentialAccount) {
      await prisma.account.update({
        where: { id: credentialAccount.id },
        data: { password: hashedPassword },
      })
    } else {
      await prisma.account.create({
        data: {
          userId: existingUser.id,
          accountId: existingUser.id,
          providerId: 'credential',
          password: hashedPassword,
        },
      })
    }

    console.log(`✅ Updated existing admin user: ${email}`)
  } else {
    // ユーザーと credential account を同時作成
    // Better Auth: パスワードは Account テーブルに保存
    const userId = crypto.randomUUID()
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        email,
        name,
        role: 'ADMIN',
        accounts: {
          create: {
            accountId: userId,
            providerId: 'credential',
            password: hashedPassword,
          },
        },
      },
    })
    console.log(`✅ Created new admin user: ${newUser.email}`)
  }
}

// =============================================================================
// Demo Spaces
// =============================================================================

async function seedSpaces() {
  const spaces = [
    {
      name: 'ミーティングルーム A',
      description: `明るく開放的なミーティングルームです。

最大8名様までご利用いただけます。プロジェクター、ホワイトボード、Wi-Fi完備。
ビジネスミーティング、少人数の研修、面接などに最適です。

【設備】
・プロジェクター
・ホワイトボード
・Wi-Fi（高速回線）
・電源タップ
・空調完備`,
      address: '東京都渋谷区神宮前1-1-1 サンプルビル3F',
      access: '東京メトロ「表参道駅」A1出口より徒歩5分',
      capacity: 8,
      area: 25.5,
      hourlyPrice: 3000,
      dailyPrice: 20000,
      mainImageUrl: 'https://placehold.co/800x600/e2e8f0/64748b?text=Meeting+Room',
      imageUrls: [
        'https://placehold.co/800x600/e2e8f0/64748b?text=Meeting+Room',
        'https://placehold.co/800x600/e2e8f0/64748b?text=Meeting+Room+2',
      ],
      facilities: ['Wi-Fi', 'プロジェクター', 'ホワイトボード', '空調', '電源タップ'],
      isPublished: true,
      isActive: true,
    },
    {
      name: 'セミナールーム',
      description: `最大30名収容可能なセミナールームです。

セミナー、ワークショップ、説明会、発表会などに最適。
スクール形式、シアター形式など、用途に合わせてレイアウト変更可能です。

【設備】
・大型スクリーン
・プロジェクター
・マイク（ワイヤレス2本）
・Wi-Fi（高速回線）
・可動式テーブル・椅子`,
      address: '東京都渋谷区神宮前1-1-1 サンプルビル4F',
      access: '東京メトロ「表参道駅」A1出口より徒歩5分',
      capacity: 30,
      area: 60.0,
      hourlyPrice: 8000,
      dailyPrice: 50000,
      mainImageUrl: 'https://placehold.co/800x600/dbeafe/3b82f6?text=Seminar+Room',
      imageUrls: [
        'https://placehold.co/800x600/dbeafe/3b82f6?text=Seminar+Room',
        'https://placehold.co/800x600/dbeafe/3b82f6?text=Seminar+Room+2',
      ],
      facilities: ['Wi-Fi', 'プロジェクター', '大型スクリーン', 'マイク', '空調', '可動式テーブル'],
      isPublished: true,
      isActive: true,
    },
    {
      name: 'コワーキングスペース',
      description: `フリーアドレスのコワーキングスペースです。

集中して作業したい方、気分転換に場所を変えて仕事したい方におすすめ。
ドリンクバー、軽食販売あり。

【設備】
・Wi-Fi（高速回線）
・電源完備
・ロッカー（有料）
・ドリンクバー
・複合機（有料）`,
      address: '東京都渋谷区神宮前1-1-1 サンプルビル2F',
      access: '東京メトロ「表参道駅」A1出口より徒歩5分',
      capacity: 20,
      area: 80.0,
      hourlyPrice: 500,
      dailyPrice: 3000,
      mainImageUrl: 'https://placehold.co/800x600/dcfce7/22c55e?text=Coworking',
      imageUrls: [
        'https://placehold.co/800x600/dcfce7/22c55e?text=Coworking',
        'https://placehold.co/800x600/dcfce7/22c55e?text=Coworking+2',
      ],
      facilities: ['Wi-Fi', '電源', 'ロッカー', 'ドリンクバー', '複合機', '空調'],
      isPublished: true,
      isActive: true,
    },
  ]

  for (const space of spaces) {
    const existing = await prisma.space.findFirst({
      where: { name: space.name },
    })

    if (!existing) {
      await prisma.space.create({ data: space })
      console.log(`✅ Created space: ${space.name}`)
    } else {
      console.log(`⏭️ Skipped existing space: ${space.name}`)
    }
  }
}

// =============================================================================
// Demo News
// =============================================================================

async function seedNews() {
  const newsItems: Prisma.NewsCreateInput[] = [
    {
      title: '【重要】年末年始の営業について',
      content: `いつもMyrrh Rental Spaceをご利用いただきありがとうございます。

年末年始の営業日程についてお知らせいたします。

【休業期間】
12月29日（日）〜 1月3日（金）

【通常営業開始】
1月4日（土）より通常営業

休業期間中にいただいたお問い合わせは、1月4日以降順次ご対応させていただきます。
ご不便をおかけいたしますが、何卒よろしくお願いいたします。`,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    {
      title: '新スペース「セミナールーム」オープンのお知らせ',
      content: `この度、最大30名収容可能な「セミナールーム」を新たにオープンいたしました。

セミナー、ワークショップ、説明会、発表会など、様々な用途でご利用いただけます。

【特徴】
・最大30名収容
・大型スクリーン＆プロジェクター完備
・ワイヤレスマイク2本付き
・可動式テーブル・椅子でレイアウト自由

オープン記念として、1月末まで全日20%OFFでご提供いたします。
この機会にぜひご利用ください。`,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1週間前
    },
    {
      title: 'Wi-Fi回線を増強しました',
      content: `より快適にご利用いただけるよう、全スペースのWi-Fi回線を増強いたしました。

これにより、オンライン会議や大容量データの送受信もストレスなく行えるようになりました。

ぜひご利用ください。`,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2週間前
    },
    {
      title: 'ホームページをリニューアルしました',
      content: `Myrrh Rental Spaceのホームページをリニューアルいたしました。

より見やすく、使いやすいデザインに生まれ変わりました。
スペースの検索・予約もスムーズに行えるようになっています。

今後ともMyrrh Rental Spaceをよろしくお願いいたします。`,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 1ヶ月前
    },
    {
      title: '【未公開】春のキャンペーン企画中',
      content: `春のキャンペーンを企画中です。詳細は後日公開予定。`,
      status: 'DRAFT',
      publishedAt: null,
    },
  ]

  for (const news of newsItems) {
    const existing = await prisma.news.findFirst({
      where: { title: news.title },
    })

    if (!existing) {
      await prisma.news.create({ data: news })
      console.log(`✅ Created news: ${news.title.slice(0, 30)}...`)
    } else {
      console.log(`⏭️ Skipped existing news: ${news.title.slice(0, 30)}...`)
    }
  }
}

// =============================================================================
// Demo Blog
// =============================================================================

async function seedBlog() {
  // First, ensure we have a user to be the author
  const author = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  })

  if (!author) {
    console.log('⚠️ No admin user found. Skipping blog seed. Create an admin first.')
    return
  }

  // Create categories
  const categories = [
    { name: '活用事例', slug: 'case-study', description: 'スペースの活用事例をご紹介' },
    { name: 'お役立ち情報', slug: 'tips', description: 'ビジネスに役立つ情報' },
    { name: 'スタッフブログ', slug: 'staff-blog', description: 'スタッフの日常やお知らせ' },
  ]

  for (const category of categories) {
    const existing = await prisma.blogCategory.findFirst({
      where: { slug: category.slug },
    })

    if (!existing) {
      await prisma.blogCategory.create({ data: category })
      console.log(`✅ Created blog category: ${category.name}`)
    }
  }

  // Get category IDs
  const caseStudyCategory = await prisma.blogCategory.findFirst({
    where: { slug: 'case-study' },
  })
  const tipsCategory = await prisma.blogCategory.findFirst({
    where: { slug: 'tips' },
  })

  if (!caseStudyCategory || !tipsCategory) {
    console.log('⚠️ Categories not found. Skipping blog posts.')
    return
  }

  // Create blog posts
  const posts: Prisma.BlogPostUncheckedCreateInput[] = [
    {
      title: 'レンタルスペースを活用したセミナー開催のコツ',
      slug: 'seminar-tips',
      excerpt: 'セミナーを成功させるための会場選びと準備のポイントをご紹介します。',
      content: `# レンタルスペースを活用したセミナー開催のコツ

セミナーを開催する際、会場選びは成功の鍵を握る重要な要素です。
今回は、レンタルスペースを活用したセミナー開催のコツをご紹介します。

## 1. 適切な広さを選ぶ

参加者数の1.5倍程度の収容人数を目安に選びましょう。
余裕があることで、参加者も快適に過ごせます。

## 2. 設備をチェック

- プロジェクター
- スクリーン
- マイク
- Wi-Fi

これらの設備が揃っているか確認しましょう。

## 3. アクセスの良さ

参加者が迷わず来られるよう、アクセスの良い場所を選びましょう。
駅から徒歩5分以内がおすすめです。

## まとめ

適切な会場選びで、セミナーの成功率がぐっと上がります。
ぜひ参考にしてみてください。`,
      thumbnailUrl: 'https://placehold.co/800x600/fef3c7/f59e0b?text=Blog+1',
      categoryId: tipsCategory.id,
      authorId: author.id,
      tags: ['セミナー', '会場選び', 'ビジネス'],
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: '会議室の上手な使い方 - 生産性を上げる5つのポイント',
      slug: 'meeting-room-productivity',
      excerpt: '会議の生産性を高めるための会議室の使い方をご紹介します。',
      content: `# 会議室の上手な使い方 - 生産性を上げる5つのポイント

会議が長引いてしまう、なかなか結論が出ない...
そんなお悩みを解決する、会議室の上手な使い方をご紹介します。

## 1. 適切なサイズの部屋を選ぶ

参加者数に対して広すぎる部屋は、緊張感が生まれにくくなります。
適切なサイズの部屋を選びましょう。

## 2. ホワイトボードを活用する

議論を可視化することで、参加者全員の認識を合わせやすくなります。

## 3. タイムキーパーを設ける

時間を意識することで、だらだらした会議を防げます。

## 4. スタンディングミーティングを取り入れる

短い打ち合わせは立って行うことで、効率アップ。

## 5. 会議後の片付けまで時間に含める

次の利用者のためにも、片付けの時間を確保しましょう。

これらのポイントを意識して、生産性の高い会議を実現しましょう！`,
      thumbnailUrl: 'https://placehold.co/800x600/e2e8f0/64748b?text=Meeting+Room',
      categoryId: tipsCategory.id,
      authorId: author.id,
      tags: ['会議', '生産性', 'ビジネス'],
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      title: '【活用事例】IT企業様の社内研修でご利用いただきました',
      slug: 'case-study-it-training',
      excerpt: 'セミナールームを社内研修でご利用いただいたIT企業様の事例をご紹介します。',
      content: `# IT企業様の社内研修でご利用いただきました

先日、IT企業のA社様に社内研修でセミナールームをご利用いただきました。

## ご利用の背景

A社様は急成長中のスタートアップ企業。
オフィスには研修用の大きな部屋がなく、外部の会場を探されていたとのこと。

## 選んでいただいた理由

- 駅から近くアクセス抜群
- 30名収容可能な広さ
- プロジェクター・マイク完備
- 料金がリーズナブル

## 当日の様子

新入社員向けの技術研修で、終日ご利用いただきました。
プロジェクターでスライドを投影しながら、
ハンズオン形式の研修を実施されていました。

## お客様の声

「オフィスから近く、設備も充実していて助かりました。
また利用したいと思います。」

ありがとうございました！
またのご利用をお待ちしております。`,
      thumbnailUrl: 'https://placehold.co/800x600/fce7f3/ec4899?text=Blog+3',
      categoryId: caseStudyCategory.id,
      authorId: author.id,
      tags: ['活用事例', '研修', 'IT企業'],
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  ]

  for (const post of posts) {
    const existing = await prisma.blogPost.findFirst({
      where: { slug: post.slug },
    })

    if (!existing) {
      await prisma.blogPost.create({ data: post })
      console.log(`✅ Created blog post: ${post.title.slice(0, 30)}...`)
    } else {
      console.log(`⏭️ Skipped existing blog post: ${post.title.slice(0, 30)}...`)
    }
  }
}

// =============================================================================
// Demo Pages
// =============================================================================

async function seedPages() {
  const pages = [
    {
      slug: 'privacy',
      title: 'プライバシーポリシー',
      description: '当サイトにおける個人情報の取り扱いについてご説明いたします。',
      content: `<p>株式会社〇〇（以下「当社」といいます。）は、当社が運営するレンタルスペース予約サービス「Myrrh Rental Space」（以下「本サービス」といいます。）において、お客様の個人情報の保護を重要な責務と認識し、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます。）を定め、個人情報の適切な取り扱いに努めます。</p>

<h2>第1条（個人情報の定義）</h2>
<p>本ポリシーにおいて「個人情報」とは、個人情報保護法に定める個人情報を指し、生存する個人に関する情報であって、当該情報に含まれる氏名、生年月日、住所、電話番号、メールアドレスその他の記述等により特定の個人を識別できるもの、または個人識別符号が含まれるものをいいます。</p>

<h2>第2条（収集する個人情報）</h2>
<p>当社は、本サービスの提供にあたり、以下の個人情報を収集することがあります。</p>
<ul>
<li>氏名（法人の場合は代表者名および担当者名）</li>
<li>メールアドレス</li>
<li>電話番号</li>
<li>住所</li>
<li>会社名・団体名（法人のお客様の場合）</li>
<li>予約情報（利用日時、利用スペース、利用目的等）</li>
<li>お支払い情報（クレジットカード情報は決済代行会社が管理）</li>
<li>お問い合わせ内容</li>
<li>本サービス利用時に自動的に収集される情報（IPアドレス、Cookie、アクセスログ等）</li>
</ul>

<h2>第3条（個人情報の利用目的）</h2>
<p>当社は、収集した個人情報を以下の目的で利用いたします。</p>
<ul>
<li>本サービスの提供、運営、維持管理</li>
<li>予約の受付、確認、変更、キャンセル処理</li>
<li>利用料金の請求、決済処理</li>
<li>お問い合わせへの対応、サポートの提供</li>
<li>本サービスに関する重要なお知らせの配信</li>
<li>新機能、キャンペーン、イベント等のご案内（お客様の同意がある場合に限ります）</li>
<li>本サービスの改善、新サービスの開発</li>
<li>利用状況の分析、統計データの作成（個人を特定できない形式で行います）</li>
<li>不正利用の防止、セキュリティの確保</li>
<li>法令に基づく対応</li>
</ul>

<h2>第4条（個人情報の第三者提供）</h2>
<p>当社は、以下の場合を除き、お客様の同意なく個人情報を第三者に提供することはありません。</p>
<ul>
<li>法令に基づく場合</li>
<li>人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき</li>
<li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合であって、本人の同意を得ることが困難であるとき</li>
<li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合であって、本人の同意を得ることにより当該事務の遂行に支障を及ぼすおそれがあるとき</li>
</ul>

<h2>第5条（個人情報の委託）</h2>
<p>当社は、本サービスの提供にあたり、個人情報の取り扱いの全部または一部を外部に委託することがあります。この場合、当社は委託先との間で適切な契約を締結し、委託先における個人情報の安全管理が図られるよう、必要かつ適切な監督を行います。</p>

<h2>第6条（個人情報の安全管理）</h2>
<p>当社は、個人情報の漏洩、滅失またはき損の防止その他の個人情報の安全管理のために、以下の措置を講じます。</p>
<ul>
<li>SSL/TLSによる通信の暗号化</li>
<li>アクセス権限の適切な管理</li>
<li>ファイアウォール等によるセキュリティ対策</li>
<li>従業員への個人情報保護に関する教育の実施</li>
<li>定期的なセキュリティ監査の実施</li>
</ul>

<h2>第7条（Cookieの使用）</h2>
<p>本サービスでは、お客様の利便性向上、利用状況の分析等の目的でCookieを使用しています。Cookieとは、ウェブサイトがお客様のブラウザに送信する小さなテキストファイルで、お客様の端末に保存されます。</p>
<h3>使用するCookieの種類</h3>
<ul>
<li><strong>必須Cookie：</strong>サービスの基本的な機能を提供するために必要なCookie</li>
<li><strong>分析Cookie：</strong>サービスの利用状況を分析し、改善に役立てるためのCookie</li>
<li><strong>機能Cookie：</strong>お客様の設定や好みを記憶するためのCookie</li>
</ul>
<p>お客様はブラウザの設定によりCookieの受け取りを拒否することができますが、その場合、本サービスの一部機能をご利用いただけない場合があります。</p>

<h2>第8条（個人情報の開示・訂正・削除）</h2>
<p>お客様は、当社に対して、ご自身の個人情報の開示、訂正、追加、削除、利用停止を請求することができます。ご請求いただいた場合、本人確認を行ったうえで、合理的な期間内に対応いたします。</p>
<p>ご請求は、本ポリシー末尾に記載のお問い合わせ窓口までご連絡ください。</p>

<h2>第9条（未成年者の個人情報）</h2>
<p>当社は、18歳未満の方から意図的に個人情報を収集することはありません。18歳未満の方が本サービスを利用される場合は、保護者の方の同意を得たうえでご利用ください。</p>

<h2>第10条（プライバシーポリシーの変更）</h2>
<p>当社は、必要に応じて本ポリシーを変更することがあります。重要な変更を行う場合は、本サービス上でお知らせするか、メールにてご連絡いたします。変更後のポリシーは、本サービス上に掲載した時点から効力を生じるものとします。</p>

<h2>第11条（お問い合わせ窓口）</h2>
<p>本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。</p>
<p><strong>株式会社〇〇</strong><br>
個人情報保護管理者: 〇〇 〇〇<br>
住所: 〒000-0000 〇〇県〇〇市〇〇町0-0-0<br>
メール: privacy@example.com<br>
電話: 00-0000-0000（受付時間: 平日 10:00〜17:00）</p>

<p style="text-align: right; margin-top: 3rem;">制定日: 2026年1月1日<br>株式会社〇〇</p>`,
      metaDescription: '当サイトにおける個人情報の取り扱いについてご説明いたします。お客様のプライバシー保護に努めています。',
      isPublished: true,
      isActive: true,
    },
    {
      slug: 'terms',
      title: '利用規約',
      description: '当サービスの利用規約をご確認ください。',
      content: `<p>この利用規約（以下「本規約」といいます。）は、株式会社〇〇（以下「当社」といいます。）が運営するレンタルスペース予約サービス「Myrrh Rental Space」（以下「本サービス」といいます。）の利用条件を定めるものです。本サービスをご利用いただく際は、本規約に同意いただいたものとみなします。</p>

<h2>第1条（適用）</h2>
<ol>
<li>本規約は、お客様と当社との間の本サービスの利用に関わる一切の関係に適用されるものとします。</li>
<li>当社は、本規約のほか、ご利用にあたってのルール等、各種の定め（以下「個別規定」といいます。）をすることがあります。これら個別規定はその名称のいかんに関わらず、本規約の一部を構成するものとします。</li>
<li>本規約の規定が前条の個別規定の規定と矛盾する場合には、個別規定において特段の定めなき限り、個別規定の規定が優先されるものとします。</li>
</ol>

<h2>第2条（定義）</h2>
<p>本規約において使用する用語の定義は、以下のとおりとします。</p>
<ul>
<li><strong>「お客様」：</strong>本サービスを利用する個人または法人</li>
<li><strong>「スペース」：</strong>本サービスを通じて予約可能なレンタルスペース</li>
<li><strong>「予約」：</strong>お客様がスペースの利用を申し込み、当社がこれを承諾すること</li>
<li><strong>「利用料金」：</strong>スペースの利用に対してお客様が支払う料金</li>
</ul>

<h2>第3条（会員登録）</h2>
<ol>
<li>本サービスの利用を希望する方は、当社の定める方法によって会員登録を行うものとします。</li>
<li>当社は、会員登録の申請者に以下の事由があると判断した場合、会員登録の申請を承認しないことがあり、その理由については一切の開示義務を負わないものとします。
<ul>
<li>虚偽の事項を届け出た場合</li>
<li>本規約に違反したことがある者からの申請である場合</li>
<li>その他、当社が会員登録を相当でないと判断した場合</li>
</ul>
</li>
</ol>

<h2>第4条（予約および利用）</h2>
<ol>
<li>お客様は、本サービス上で希望のスペースを選択し、所定の手続きを経て予約を行うものとします。</li>
<li>予約は、当社からの予約確認通知をもって成立するものとします。</li>
<li>お客様は、予約時に指定した利用時間内にスペースを利用するものとし、利用時間を超過した場合は、当社が定める延長料金をお支払いいただきます。</li>
<li>お客様は、スペースを善良な管理者の注意をもって利用するものとし、利用終了時には原状回復を行うものとします。</li>
</ol>

<h2>第5条（利用料金および支払方法）</h2>
<ol>
<li>お客様は、スペースの利用の対価として、本サービス上に表示される利用料金を当社が指定する方法により支払うものとします。</li>
<li>利用料金の支払方法は、クレジットカード決済、銀行振込、その他当社が指定する方法によるものとします。</li>
<li>お客様が利用料金の支払を遅滞した場合、お客様は年14.6%の割合による遅延損害金を支払うものとします。</li>
</ol>

<h2>第6条（キャンセルおよび返金）</h2>
<ol>
<li>お客様は、予約をキャンセルする場合、本サービス上の所定の手続きにより行うものとします。</li>
<li>キャンセルに伴う返金は、以下のキャンセルポリシーに基づいて行います。
<ul>
<li>利用日の7日前まで：全額返金</li>
<li>利用日の3日前まで：50%返金</li>
<li>利用日の前日まで：30%返金</li>
<li>利用日当日：返金なし</li>
</ul>
</li>
<li>当社の都合により予約をキャンセルする場合は、利用料金の全額を返金いたします。</li>
</ol>

<h2>第7条（禁止事項）</h2>
<p>お客様は、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
<ul>
<li>法令または公序良俗に違反する行為</li>
<li>犯罪行為に関連する行為</li>
<li>当社、他のお客様、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為</li>
<li>当社のサービスの運営を妨害するおそれのある行為</li>
<li>他のお客様に関する個人情報等を収集または蓄積する行為</li>
<li>不正アクセスをし、またはこれを試みる行為</li>
<li>他のお客様に成りすます行為</li>
<li>当社のサービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為</li>
<li>スペース内での喫煙（指定の喫煙スペースを除く）</li>
<li>スペース内での火気の使用（許可された場合を除く）</li>
<li>近隣住民への迷惑行為（騒音、悪臭等）</li>
<li>スペースの設備・備品の損壊、汚損</li>
<li>許可なく第三者にスペースを転貸する行為</li>
<li>その他、当社が不適切と判断する行為</li>
</ul>

<h2>第8条（本サービスの提供の停止等）</h2>
<ol>
<li>当社は、以下のいずれかの事由があると判断した場合、お客様に事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。
<ul>
<li>本サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
<li>地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
<li>コンピュータまたは通信回線等が事故により停止した場合</li>
<li>その他、当社が本サービスの提供が困難と判断した場合</li>
</ul>
</li>
<li>当社は、本サービスの提供の停止または中断により、お客様または第三者が被ったいかなる不利益または損害についても、一切の責任を負わないものとします。</li>
</ol>

<h2>第9条（損害賠償）</h2>
<ol>
<li>お客様がスペースの設備・備品を損壊、汚損した場合、お客様は当社に対し、その修繕または原状回復に要する費用を賠償するものとします。</li>
<li>お客様が本規約に違反し、当社または第三者に損害を与えた場合、お客様はその損害を賠償するものとします。</li>
</ol>

<h2>第10条（免責事項）</h2>
<ol>
<li>当社は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。</li>
<li>当社は、本サービスに起因してお客様に生じたあらゆる損害について、当社の故意又は重過失による場合を除き、一切の責任を負いません。ただし、本サービスに関する当社とお客様との間の契約（本規約を含みます。）が消費者契約法に定める消費者契約となる場合、この免責規定は適用されません。</li>
<li>当社は、お客様がスペース内に持ち込んだ物品の盗難、紛失、損壊について、一切の責任を負いません。</li>
</ol>

<h2>第11条（サービス内容の変更等）</h2>
<p>当社は、お客様への事前の通知なく、本サービスの内容を変更し、または本サービスの提供を中止することができるものとし、これによってお客様に生じた損害について一切の責任を負いません。</p>

<h2>第12条（利用規約の変更）</h2>
<ol>
<li>当社は、必要と判断した場合には、お客様に通知することなくいつでも本規約を変更することができるものとします。</li>
<li>変更後の利用規約は、本サービス上に掲載した時点から効力を生じるものとします。</li>
<li>お客様が本規約の変更後も本サービスの利用を継続する場合、変更後の規約に同意したものとみなします。</li>
</ol>

<h2>第13条（個人情報の取扱い）</h2>
<p>当社は、本サービスの利用によって取得する個人情報については、当社「プライバシーポリシー」に従い適切に取り扱うものとします。</p>

<h2>第14条（権利義務の譲渡の禁止）</h2>
<p>お客様は、当社の書面による事前の承諾なく、利用契約上の地位または本規約に基づく権利もしくは義務を第三者に譲渡し、または担保に供することはできません。</p>

<h2>第15条（準拠法・裁判管轄）</h2>
<ol>
<li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
<li>本サービスに関して紛争が生じた場合には、当社の本店所在地を管轄する裁判所を専属的合意管轄とします。</li>
</ol>

<h2>第16条（お問い合わせ窓口）</h2>
<p>本規約に関するお問い合わせは、以下の窓口までお願いいたします。</p>
<p><strong>株式会社〇〇</strong><br>
住所: 〒000-0000 〇〇県〇〇市〇〇町0-0-0<br>
メール: support@example.com<br>
電話: 00-0000-0000（受付時間: 平日 10:00〜17:00）</p>

<p style="text-align: right; margin-top: 3rem;">制定日: 2026年1月1日<br>株式会社〇〇</p>`,
      metaDescription: '当サービスの利用規約をご確認ください。ご利用前に必ずお読みいただき、同意のうえでご利用ください。',
      isPublished: true,
      isActive: true,
    },
  ]

  for (const page of pages) {
    const existing = await prisma.page.findFirst({
      where: { slug: page.slug },
    })

    if (!existing) {
      await prisma.page.create({ data: page })
      console.log(`✅ Created page: ${page.title}`)
    } else {
      console.log(`⏭️ Skipped existing page: ${page.title}`)
    }
  }

  // SEOのみ編集可能なシステムページ（コンテンツはコードで実装）
  const seoOnlyPages = [
    { slug: 'reservation', title: '予約', description: 'レンタルスペースの予約' },
    { slug: 'spaces', title: 'スペース一覧', description: 'ご利用可能なレンタルスペース' },
    { slug: 'contact', title: 'お問い合わせ', description: 'お問い合わせフォーム' },
    { slug: 'blog', title: 'ブログ', description: 'ブログ記事一覧' },
    { slug: 'news', title: 'お知らせ', description: 'ニュース・お知らせ一覧' },
    { slug: 'about', title: '会社概要', description: '会社・サービスについて' },
    { slug: 'faq', title: 'よくある質問', description: 'FAQ' },
  ]

  for (const page of seoOnlyPages) {
    const existing = await prisma.page.findFirst({
      where: { slug: page.slug },
    })

    if (!existing) {
      await prisma.page.create({
        data: {
          slug: page.slug,
          title: page.title,
          description: page.description,
          content: '',
          isPublished: true,
          isActive: true,
          isSystemPage: true,
        },
      })
      console.log(`✅ Created system page: ${page.title}`)
    } else if (!existing.isSystemPage) {
      // 既存ページをシステムページに更新
      await prisma.page.update({
        where: { id: existing.id },
        data: { isSystemPage: true },
      })
      console.log(`🔄 Updated to system page: ${page.title}`)
    } else {
      console.log(`⏭️ Skipped existing system page: ${page.title}`)
    }
  }
}

// =============================================================================
// Demo Homepage Sections
// =============================================================================

async function seedHomepageSections() {
  const existingCount = await prisma.homepageSection.count()

  if (existingCount > 0) {
    console.log('⏭️ Homepage sections already exist')
    return
  }

  const sections: Prisma.HomepageSectionCreateInput[] = [
    {
      type: 'HERO',
      config: {
        title: '理想のスペースを、あなたに。',
        subtitle: 'ビジネスからプライベートまで、あらゆるシーンに対応するレンタルスペース',
        backgroundImageUrl: '',
        ctaPrimary: { text: 'スペースを探す', url: '/spaces' },
        ctaSecondary: { text: 'お問い合わせ', url: '/contact' },
      },
      order: 0,
      isActive: true,
    },
    {
      type: 'SPACE_LIST',
      config: {
        maxItems: 6,
        showOnlyPublished: true,
      },
      order: 1,
      isActive: true,
    },
    {
      type: 'NEWS',
      config: {
        title: 'お知らせ',
        maxItems: 3,
        showViewAllLink: true,
      },
      order: 2,
      isActive: true,
    },
    {
      type: 'BLOG',
      config: {
        title: '最新の記事',
        maxItems: 3,
        showViewAllLink: true,
      },
      order: 3,
      isActive: true,
    },
    {
      type: 'FAQ',
      config: {
        title: 'よくあるご質問',
        maxItems: 5,
        items: [
          {
            question: '予約のキャンセルはできますか？',
            answer: 'はい、予約日の48時間前までは無料でキャンセル可能です。それ以降のキャンセルは料金の50%をご負担いただきます。',
          },
          {
            question: '支払い方法は何がありますか？',
            answer: 'クレジットカード（Visa, Mastercard, AMEX）、銀行振込に対応しております。',
          },
          {
            question: '利用時間の延長はできますか？',
            answer: '空き状況に応じて可能です。当日、スタッフにお申し付けください。',
          },
        ],
      },
      order: 4,
      isActive: true,
    },
    {
      type: 'CTA',
      config: {
        title: 'ご予約・お問い合わせ',
        description: 'お気軽にお問い合わせください',
        ctaPrimary: { text: '予約する', url: '/reservation' },
        ctaSecondary: { text: 'お問い合わせ', url: '/contact' },
      },
      order: 5,
      isActive: true,
    },
  ]

  for (const section of sections) {
    await prisma.homepageSection.create({ data: section })
  }

  console.log('✅ Created homepage sections')
}

// =============================================================================
// Demo Settings
// =============================================================================

async function seedSettings() {
  const existing = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  const settingsData = {
    siteName: 'Myrrh Rental Space',
    siteDescription: 'ビジネスからプライベートまで、様々な用途に対応したレンタルスペース',
    businessName: '株式会社サンプル',
    businessNameKana: 'カブシキガイシャサンプル',
    representativeName: '山田 太郎',
    businessType: '法人',
    phoneNumber: '03-1234-5678',
    email: 'info@example.com',
    address: '東京都渋谷区神宮前1-1-1 サンプルビル',
    postalCode: '150-0001',
    prefecture: '東京都',
    city: '渋谷区',
    streetAddress: '神宮前1-1-1 サンプルビル',
    footerCopyright: '© 2025 Myrrh Rental Space. All rights reserved.',
  }

  if (!existing) {
    await prisma.settings.create({
      data: {
        id: 'singleton',
        ...settingsData,
      },
    })
    console.log('✅ Created settings')
  } else {
    console.log('⏭️ Settings already exist')
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
Usage:
  bun prisma/seed.ts --admin <email> <password> [name]  # Create admin user only
  bun prisma/seed.ts --demo                              # Create demo data only
  bun prisma/seed.ts --all <email> <password> [name]     # Create all data

Examples:
  bun prisma/seed.ts --admin admin@example.com mypassword123
  bun prisma/seed.ts --demo
  bun prisma/seed.ts --all admin@example.com mypassword123 "Administrator"
`)
    process.exit(1)
  }

  const mode = args[0]

  console.log('')
  console.log('🌱 Starting seed...')
  console.log('')

  if (mode === '--admin') {
    if (args.length < 3) {
      console.error('Error: --admin requires <email> and <password>')
      process.exit(1)
    }
    const email = args[1]
    const password = args[2]
    const name = args[3] || 'Administrator'

    await seedAdmin(email, password, name)
  } else if (mode === '--demo') {
    console.log('📦 Creating demo data...')
    console.log('')

    await seedSettings()
    await seedSpaces()
    await seedNews()
    await seedPages()
    await seedHomepageSections()

    // Blog needs an admin user
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (adminUser) {
      await seedBlog()
    } else {
      console.log('⚠️ No admin user found. Skipping blog seed.')
      console.log('   Create an admin first: bun prisma/seed.ts --admin <email> <password>')
    }
  } else if (mode === '--all') {
    if (args.length < 3) {
      console.error('Error: --all requires <email> and <password>')
      process.exit(1)
    }
    const email = args[1]
    const password = args[2]
    const name = args[3] || 'Administrator'

    await seedAdmin(email, password, name)

    console.log('')
    console.log('📦 Creating demo data...')
    console.log('')

    await seedSettings()
    await seedSpaces()
    await seedNews()
    await seedPages()
    await seedHomepageSections()
    await seedBlog()
  } else {
    // Legacy mode: bun prisma/seed.ts <email> <password> [name]
    if (args.length >= 2 && !args[0].startsWith('--')) {
      const email = args[0]
      const password = args[1]
      const name = args[2] || 'Administrator'
      await seedAdmin(email, password, name)
    } else {
      console.error('Unknown option:', mode)
      process.exit(1)
    }
  }

  console.log('')
  console.log('✨ Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
