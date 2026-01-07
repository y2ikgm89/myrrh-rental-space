/**
 * ホームページ（仮）
 */

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Myrrh Rental Space
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          レンタルスペースの予約・管理サービス
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="/spaces"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            スペースを見る
          </a>
          <a
            href="/contact"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            お問い合わせ
          </a>
        </div>
      </div>
    </div>
  )
}
