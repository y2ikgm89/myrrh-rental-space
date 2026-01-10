'use client'

/**
 * CSVエクスポートボタンコンポーネント
 */

import { useState } from 'react'
import { Button } from './ui'
import type { ReactElement } from 'react'

interface ExportButtonProps {
  exportFn: (options?: { startDate?: string; endDate?: string }) => Promise<{
    success: boolean
    data?: string
    filename?: string
    error?: string
  }>
  label?: string
  startDate?: string
  endDate?: string
}

export function ExportButton({
  exportFn,
  label = 'CSVエクスポート',
  startDate,
  endDate,
}: ExportButtonProps): ReactElement {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const result = await exportFn({ startDate, endDate })

      if (result.success && result.data && result.filename) {
        // Blobを作成してダウンロード
        const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        alert(result.error || 'エクスポートに失敗しました')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <>
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          エクスポート中...
        </>
      ) : (
        <>
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          {label}
        </>
      )}
    </Button>
  )
}
