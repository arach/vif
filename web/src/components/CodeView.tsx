import { File } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'

interface CodeViewProps {
  content: string
  filename?: string
  language?: string
  theme?: 'github-dark' | 'github-light' | 'nord' | 'dracula' | 'one-dark-pro' | 'pierre-dark' | 'pierre-light'
  showLineNumbers?: boolean
  className?: string
}

export function CodeView({
  content,
  filename = 'file',
  language = 'yaml',
  theme = 'github-dark',
  showLineNumbers = true,
  className,
}: CodeViewProps) {
  const file: FileContents = {
    name: filename,
    contents: content,
    lang: language as any,
  }

  return (
    <div className={`code-view ${className || ''}`}>
      <File
        file={file}
        options={{
          theme,
          disableLineNumbers: !showLineNumbers,
          overflow: 'scroll',
          disableFileHeader: true,
        }}
        className="code-view-inner"
      />
    </div>
  )
}

// Styles for the code view
export const codeViewStyles = `
  .code-view {
    font-size: 13px;
    line-height: 1.6;
  }
  .code-view [data-pierre-diffs] {
    background: transparent !important;
  }
  .code-view pre {
    padding: 16px !important;
    margin: 0 !important;
  }
`
