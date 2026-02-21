/**
 * Code Inspector Panel
 *
 * @description CodeNode の言語セレクタパネル
 */

'use client'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isCodeNode } from '@lexical/code'
import type { CodeNode } from '@lexical/code'
import type { NodeKey } from 'lexical'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import { Label } from '@/admin/components/ui/label'

const CODE_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'プレーンテキスト' },
] as const

type Props = {
  nodeKey: NodeKey
  node: CodeNode
}

export function CodeInspectorPanel({ nodeKey, node }: Props) {
  const [editor] = useLexicalComposerContext()

  const currentLanguage = node.getLanguage() ?? 'text'

  function handleLanguageChange(language: string) {
    editor.update(() => {
      const codeNode = $getNodeByKey(nodeKey)
      if ($isCodeNode(codeNode)) {
        codeNode.setLanguage(language)
      }
    })
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">コードブロック設定</h3>
      <div className="space-y-2">
        <Label htmlFor="code-language">言語</Label>
        <Select value={currentLanguage} onValueChange={handleLanguageChange}>
          <SelectTrigger id="code-language">
            <SelectValue placeholder="言語を選択" />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
