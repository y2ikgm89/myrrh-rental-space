/**
 * プライバシーポリシーページ
 *
 * @description 個人情報の取り扱いに関するポリシーを表示
 */

import type { Metadata } from 'next'
import { tv } from 'tailwind-variants'
import { Container } from '@/components/site/ui'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description:
    '当サイトにおける個人情報の取り扱いについてご説明いたします。お客様のプライバシー保護に努めています。',
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-12 text-center',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    lastUpdated: 'mt-2 text-sm text-muted-foreground',
    content: 'prose prose-slate dark:prose-invert max-w-none',
    articleSection: 'mb-10',
    articleTitle: 'text-xl font-semibold text-foreground mb-4',
    articleContent: 'text-muted-foreground leading-relaxed space-y-4',
    list: 'list-disc list-inside space-y-2 ml-4',
    subSection: 'mt-6',
    subTitle: 'text-lg font-medium text-foreground mb-2',
  },
})()

export default function PrivacyPolicyPage(): ReactElement {
  return (
    <section className={styles.section()}>
      <Container size="md">
        <header className={styles.header()}>
          <h1 className={styles.title()}>プライバシーポリシー</h1>
          <p className={styles.lastUpdated()}>最終更新日: 2026年1月1日</p>
        </header>

        <div className={styles.content()}>
          {/* 前文 */}
          <article className={styles.articleSection()}>
            <div className={styles.articleContent()}>
              <p>
                株式会社〇〇（以下「当社」といいます。）は、当社が運営するレンタルスペース予約サービス「Myrrh
                Rental
                Space」（以下「本サービス」といいます。）において、お客様の個人情報の保護を重要な責務と認識し、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます。）を定め、個人情報の適切な取り扱いに努めます。
              </p>
            </div>
          </article>

          {/* 第1条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第1条（個人情報の定義）</h2>
            <div className={styles.articleContent()}>
              <p>
                本ポリシーにおいて「個人情報」とは、個人情報保護法に定める個人情報を指し、生存する個人に関する情報であって、当該情報に含まれる氏名、生年月日、住所、電話番号、メールアドレスその他の記述等により特定の個人を識別できるもの、または個人識別符号が含まれるものをいいます。
              </p>
            </div>
          </article>

          {/* 第2条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第2条（収集する個人情報）</h2>
            <div className={styles.articleContent()}>
              <p>当社は、本サービスの提供にあたり、以下の個人情報を収集することがあります。</p>
              <ul className={styles.list()}>
                <li>氏名（法人の場合は代表者名および担当者名）</li>
                <li>メールアドレス</li>
                <li>電話番号</li>
                <li>住所</li>
                <li>会社名・団体名（法人のお客様の場合）</li>
                <li>予約情報（利用日時、利用スペース、利用目的等）</li>
                <li>お支払い情報（クレジットカード情報は決済代行会社が管理）</li>
                <li>お問い合わせ内容</li>
                <li>
                  本サービス利用時に自動的に収集される情報（IPアドレス、Cookie、アクセスログ等）
                </li>
              </ul>
            </div>
          </article>

          {/* 第3条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第3条（個人情報の利用目的）</h2>
            <div className={styles.articleContent()}>
              <p>当社は、収集した個人情報を以下の目的で利用いたします。</p>
              <ul className={styles.list()}>
                <li>本サービスの提供、運営、維持管理</li>
                <li>予約の受付、確認、変更、キャンセル処理</li>
                <li>利用料金の請求、決済処理</li>
                <li>お問い合わせへの対応、サポートの提供</li>
                <li>本サービスに関する重要なお知らせの配信</li>
                <li>
                  新機能、キャンペーン、イベント等のご案内（お客様の同意がある場合に限ります）
                </li>
                <li>本サービスの改善、新サービスの開発</li>
                <li>利用状況の分析、統計データの作成（個人を特定できない形式で行います）</li>
                <li>不正利用の防止、セキュリティの確保</li>
                <li>法令に基づく対応</li>
              </ul>
            </div>
          </article>

          {/* 第4条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第4条（個人情報の第三者提供）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、以下の場合を除き、お客様の同意なく個人情報を第三者に提供することはありません。
              </p>
              <ul className={styles.list()}>
                <li>法令に基づく場合</li>
                <li>
                  人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき
                </li>
                <li>
                  公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合であって、本人の同意を得ることが困難であるとき
                </li>
                <li>
                  国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合であって、本人の同意を得ることにより当該事務の遂行に支障を及ぼすおそれがあるとき
                </li>
              </ul>
            </div>
          </article>

          {/* 第5条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第5条（個人情報の委託）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、本サービスの提供にあたり、個人情報の取り扱いの全部または一部を外部に委託することがあります。この場合、当社は委託先との間で適切な契約を締結し、委託先における個人情報の安全管理が図られるよう、必要かつ適切な監督を行います。
              </p>
            </div>
          </article>

          {/* 第6条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第6条（個人情報の安全管理）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、個人情報の漏洩、滅失またはき損の防止その他の個人情報の安全管理のために、以下の措置を講じます。
              </p>
              <ul className={styles.list()}>
                <li>SSL/TLSによる通信の暗号化</li>
                <li>アクセス権限の適切な管理</li>
                <li>ファイアウォール等によるセキュリティ対策</li>
                <li>従業員への個人情報保護に関する教育の実施</li>
                <li>定期的なセキュリティ監査の実施</li>
              </ul>
            </div>
          </article>

          {/* 第7条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第7条（Cookieの使用）</h2>
            <div className={styles.articleContent()}>
              <p>
                本サービスでは、お客様の利便性向上、利用状況の分析等の目的でCookieを使用しています。Cookieとは、ウェブサイトがお客様のブラウザに送信する小さなテキストファイルで、お客様の端末に保存されます。
              </p>

              <div className={styles.subSection()}>
                <h3 className={styles.subTitle()}>使用するCookieの種類</h3>
                <ul className={styles.list()}>
                  <li>
                    <strong>必須Cookie：</strong>
                    サービスの基本的な機能を提供するために必要なCookie
                  </li>
                  <li>
                    <strong>分析Cookie：</strong>
                    サービスの利用状況を分析し、改善に役立てるためのCookie
                  </li>
                  <li>
                    <strong>機能Cookie：</strong>お客様の設定や好みを記憶するためのCookie
                  </li>
                </ul>
              </div>

              <p>
                お客様はブラウザの設定によりCookieの受け取りを拒否することができますが、その場合、本サービスの一部機能をご利用いただけない場合があります。
              </p>
            </div>
          </article>

          {/* 第8条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>
              第8条（個人情報の開示・訂正・削除）
            </h2>
            <div className={styles.articleContent()}>
              <p>
                お客様は、当社に対して、ご自身の個人情報の開示、訂正、追加、削除、利用停止を請求することができます。ご請求いただいた場合、本人確認を行ったうえで、合理的な期間内に対応いたします。
              </p>
              <p>ご請求は、本ポリシー末尾に記載のお問い合わせ窓口までご連絡ください。</p>
            </div>
          </article>

          {/* 第9条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第9条（未成年者の個人情報）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、18歳未満の方から意図的に個人情報を収集することはありません。18歳未満の方が本サービスを利用される場合は、保護者の方の同意を得たうえでご利用ください。
              </p>
            </div>
          </article>

          {/* 第10条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>
              第10条（プライバシーポリシーの変更）
            </h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、必要に応じて本ポリシーを変更することがあります。重要な変更を行う場合は、本サービス上でお知らせするか、メールにてご連絡いたします。変更後のポリシーは、本サービス上に掲載した時点から効力を生じるものとします。
              </p>
            </div>
          </article>

          {/* 第11条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第11条（お問い合わせ窓口）</h2>
            <div className={styles.articleContent()}>
              <p>
                本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。
              </p>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p>
                  <strong>株式会社〇〇</strong>
                </p>
                <p>個人情報保護管理者: 〇〇 〇〇</p>
                <p>住所: 〒000-0000 〇〇県〇〇市〇〇町0-0-0</p>
                <p>メール: privacy@example.com</p>
                <p>電話: 00-0000-0000（受付時間: 平日 10:00〜17:00）</p>
              </div>
            </div>
          </article>

          {/* 制定日 */}
          <div className="mt-12 text-right text-sm text-muted-foreground">
            <p>制定日: 2026年1月1日</p>
            <p>株式会社〇〇</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
