import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { Container } from '@/components/site/ui/Container'
import { ContactForm } from './_components/ContactForm'

export const metadata: Metadata = {
  title: 'お問い合わせ | Myrrh Rental Space',
  description:
    'レンタルスペースに関するお問い合わせはこちらから。ご質問・ご予約のご相談など、お気軽にお問い合わせください。',
}

export default function ContactPage(): ReactElement {
  return (
    <section className="py-12 md:py-16 lg:py-20">
      <Container size="sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            お問い合わせ
          </h1>
          <p className="mt-4 text-muted-foreground">
            ご質問やご予約のご相談など、お気軽にお問い合わせください。
            <br />
            通常、2営業日以内にご返信いたします。
          </p>
        </div>

        <ContactForm />

        <div className="mt-12 rounded-lg border bg-muted/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">その他のお問い合わせ方法</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium">営業時間</dt>
              <dd className="text-muted-foreground">
                平日 10:00 - 18:00（土日祝休み）
              </dd>
            </div>
            <div>
              <dt className="font-medium">メールアドレス</dt>
              <dd className="text-muted-foreground">
                <a
                  href="mailto:contact@example.com"
                  className="text-primary hover:underline"
                >
                  contact@example.com
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </Container>
    </section>
  )
}
