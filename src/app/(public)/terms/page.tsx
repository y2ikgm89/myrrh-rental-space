/**
 * 利用規約ページ
 *
 * @description レンタルスペースサービスの利用規約を表示
 */

import type { Metadata } from 'next'
import { tv } from 'tailwind-variants'
import { Container } from '@/components/site/ui'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: '利用規約',
  description:
    '当サービスの利用規約をご確認ください。ご利用前に必ずお読みいただき、同意のうえでご利用ください。',
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
    orderedList: 'list-decimal list-inside space-y-2 ml-4',
    subSection: 'mt-6',
    subTitle: 'text-lg font-medium text-foreground mb-2',
  },
})()

export default function TermsOfServicePage(): ReactElement {
  return (
    <section className={styles.section()}>
      <Container size="md">
        <header className={styles.header()}>
          <h1 className={styles.title()}>利用規約</h1>
          <p className={styles.lastUpdated()}>最終更新日: 2026年1月1日</p>
        </header>

        <div className={styles.content()}>
          {/* 前文 */}
          <article className={styles.articleSection()}>
            <div className={styles.articleContent()}>
              <p>
                この利用規約（以下「本規約」といいます。）は、株式会社〇〇（以下「当社」といいます。）が運営するレンタルスペース予約サービス「Myrrh
                Rental
                Space」（以下「本サービス」といいます。）の利用条件を定めるものです。本サービスをご利用いただく際は、本規約に同意いただいたものとみなします。
              </p>
            </div>
          </article>

          {/* 第1条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第1条（適用）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  本規約は、お客様と当社との間の本サービスの利用に関わる一切の関係に適用されるものとします。
                </li>
                <li>
                  当社は、本規約のほか、ご利用にあたってのルール等、各種の定め（以下「個別規定」といいます。）をすることがあります。これら個別規定はその名称のいかんに関わらず、本規約の一部を構成するものとします。
                </li>
                <li>
                  本規約の規定が前条の個別規定の規定と矛盾する場合には、個別規定において特段の定めなき限り、個別規定の規定が優先されるものとします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第2条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第2条（定義）</h2>
            <div className={styles.articleContent()}>
              <p>本規約において使用する用語の定義は、以下のとおりとします。</p>
              <ul className={styles.list()}>
                <li>
                  <strong>「お客様」：</strong>
                  本サービスを利用する個人または法人
                </li>
                <li>
                  <strong>「スペース」：</strong>
                  本サービスを通じて予約可能なレンタルスペース
                </li>
                <li>
                  <strong>「予約」：</strong>
                  お客様がスペースの利用を申し込み、当社がこれを承諾すること
                </li>
                <li>
                  <strong>「利用料金」：</strong>
                  スペースの利用に対してお客様が支払う料金
                </li>
              </ul>
            </div>
          </article>

          {/* 第3条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第3条（会員登録）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  本サービスの利用を希望する方は、当社の定める方法によって会員登録を行うものとします。
                </li>
                <li>
                  当社は、会員登録の申請者に以下の事由があると判断した場合、会員登録の申請を承認しないことがあり、その理由については一切の開示義務を負わないものとします。
                  <ul className={styles.list()}>
                    <li>虚偽の事項を届け出た場合</li>
                    <li>本規約に違反したことがある者からの申請である場合</li>
                    <li>その他、当社が会員登録を相当でないと判断した場合</li>
                  </ul>
                </li>
              </ol>
            </div>
          </article>

          {/* 第4条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第4条（予約および利用）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  お客様は、本サービス上で希望のスペースを選択し、所定の手続きを経て予約を行うものとします。
                </li>
                <li>予約は、当社からの予約確認通知をもって成立するものとします。</li>
                <li>
                  お客様は、予約時に指定した利用時間内にスペースを利用するものとし、利用時間を超過した場合は、当社が定める延長料金をお支払いいただきます。
                </li>
                <li>
                  お客様は、スペースを善良な管理者の注意をもって利用するものとし、利用終了時には原状回復を行うものとします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第5条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第5条（利用料金および支払方法）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  お客様は、スペースの利用の対価として、本サービス上に表示される利用料金を当社が指定する方法により支払うものとします。
                </li>
                <li>
                  利用料金の支払方法は、クレジットカード決済、銀行振込、その他当社が指定する方法によるものとします。
                </li>
                <li>
                  お客様が利用料金の支払を遅滞した場合、お客様は年14.6%の割合による遅延損害金を支払うものとします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第6条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>
              第6条（キャンセルおよび返金）
            </h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  お客様は、予約をキャンセルする場合、本サービス上の所定の手続きにより行うものとします。
                </li>
                <li>
                  キャンセルに伴う返金は、以下のキャンセルポリシーに基づいて行います。
                  <ul className={styles.list()}>
                    <li>利用日の7日前まで：全額返金</li>
                    <li>利用日の3日前まで：50%返金</li>
                    <li>利用日の前日まで：30%返金</li>
                    <li>利用日当日：返金なし</li>
                  </ul>
                </li>
                <li>
                  当社の都合により予約をキャンセルする場合は、利用料金の全額を返金いたします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第7条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第7条（禁止事項）</h2>
            <div className={styles.articleContent()}>
              <p>
                お客様は、本サービスの利用にあたり、以下の行為をしてはなりません。
              </p>
              <ul className={styles.list()}>
                <li>法令または公序良俗に違反する行為</li>
                <li>犯罪行為に関連する行為</li>
                <li>
                  当社、他のお客様、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為
                </li>
                <li>当社のサービスの運営を妨害するおそれのある行為</li>
                <li>他のお客様に関する個人情報等を収集または蓄積する行為</li>
                <li>不正アクセスをし、またはこれを試みる行為</li>
                <li>他のお客様に成りすます行為</li>
                <li>
                  当社のサービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為
                </li>
                <li>スペース内での喫煙（指定の喫煙スペースを除く）</li>
                <li>スペース内での火気の使用（許可された場合を除く）</li>
                <li>近隣住民への迷惑行為（騒音、悪臭等）</li>
                <li>スペースの設備・備品の損壊、汚損</li>
                <li>許可なく第三者にスペースを転貸する行為</li>
                <li>その他、当社が不適切と判断する行為</li>
              </ul>
            </div>
          </article>

          {/* 第8条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>
              第8条（本サービスの提供の停止等）
            </h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  当社は、以下のいずれかの事由があると判断した場合、お客様に事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。
                  <ul className={styles.list()}>
                    <li>
                      本サービスにかかるコンピュータシステムの保守点検または更新を行う場合
                    </li>
                    <li>
                      地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合
                    </li>
                    <li>コンピュータまたは通信回線等が事故により停止した場合</li>
                    <li>その他、当社が本サービスの提供が困難と判断した場合</li>
                  </ul>
                </li>
                <li>
                  当社は、本サービスの提供の停止または中断により、お客様または第三者が被ったいかなる不利益または損害についても、一切の責任を負わないものとします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第9条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第9条（損害賠償）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  お客様がスペースの設備・備品を損壊、汚損した場合、お客様は当社に対し、その修繕または原状回復に要する費用を賠償するものとします。
                </li>
                <li>
                  お客様が本規約に違反し、当社または第三者に損害を与えた場合、お客様はその損害を賠償するものとします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第10条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第10条（免責事項）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  当社は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。
                </li>
                <li>
                  当社は、本サービスに起因してお客様に生じたあらゆる損害について、当社の故意又は重過失による場合を除き、一切の責任を負いません。ただし、本サービスに関する当社とお客様との間の契約（本規約を含みます。）が消費者契約法に定める消費者契約となる場合、この免責規定は適用されません。
                </li>
                <li>
                  当社は、お客様がスペース内に持ち込んだ物品の盗難、紛失、損壊について、一切の責任を負いません。
                </li>
              </ol>
            </div>
          </article>

          {/* 第11条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第11条（サービス内容の変更等）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、お客様への事前の通知なく、本サービスの内容を変更し、または本サービスの提供を中止することができるものとし、これによってお客様に生じた損害について一切の責任を負いません。
              </p>
            </div>
          </article>

          {/* 第12条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第12条（利用規約の変更）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>
                  当社は、必要と判断した場合には、お客様に通知することなくいつでも本規約を変更することができるものとします。
                </li>
                <li>
                  変更後の利用規約は、本サービス上に掲載した時点から効力を生じるものとします。
                </li>
                <li>
                  お客様が本規約の変更後も本サービスの利用を継続する場合、変更後の規約に同意したものとみなします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第13条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第13条（個人情報の取扱い）</h2>
            <div className={styles.articleContent()}>
              <p>
                当社は、本サービスの利用によって取得する個人情報については、当社「プライバシーポリシー」に従い適切に取り扱うものとします。
              </p>
            </div>
          </article>

          {/* 第14条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>
              第14条（権利義務の譲渡の禁止）
            </h2>
            <div className={styles.articleContent()}>
              <p>
                お客様は、当社の書面による事前の承諾なく、利用契約上の地位または本規約に基づく権利もしくは義務を第三者に譲渡し、または担保に供することはできません。
              </p>
            </div>
          </article>

          {/* 第15条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第15条（準拠法・裁判管轄）</h2>
            <div className={styles.articleContent()}>
              <ol className={styles.orderedList()}>
                <li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
                <li>
                  本サービスに関して紛争が生じた場合には、当社の本店所在地を管轄する裁判所を専属的合意管轄とします。
                </li>
              </ol>
            </div>
          </article>

          {/* 第16条 */}
          <article className={styles.articleSection()}>
            <h2 className={styles.articleTitle()}>第16条（お問い合わせ窓口）</h2>
            <div className={styles.articleContent()}>
              <p>
                本規約に関するお問い合わせは、以下の窓口までお願いいたします。
              </p>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p>
                  <strong>株式会社〇〇</strong>
                </p>
                <p>住所: 〒000-0000 〇〇県〇〇市〇〇町0-0-0</p>
                <p>メール: support@example.com</p>
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
