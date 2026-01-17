import { useMemo } from 'react'
import { File } from '@pierre/diffs/react'
import type { FileContents, LineAnnotation } from '@pierre/diffs'
import { validateScene, ValidationIssue } from '@/lib/scene-validator'

interface SceneEditorProps {
  content: string
  filename?: string
  showValidation?: boolean
}

export function SceneEditor({
  content,
  filename = 'scene.yaml',
  showValidation = true,
}: SceneEditorProps) {
  // Validate the scene
  const validation = useMemo(() => {
    if (!showValidation) return null
    return validateScene(content)
  }, [content, showValidation])

  // Create line annotations from validation issues
  const lineAnnotations = useMemo(() => {
    if (!validation) return []

    return validation.issues.map((issue) => ({
      lineNumber: issue.line,
      metadata: issue,
    }))
  }, [validation])

  const file: FileContents = {
    name: filename,
    contents: content,
    lang: 'yaml',
  }

  return (
    <div className="scene-editor">
      {/* Validation Status Bar */}
      {validation && (
        <div className={`
          px-4 py-2 text-sm flex items-center justify-between border-b
          ${validation.valid
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : validation.issues.some(i => i.type === 'error')
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
          }
        `}>
          <span>{validation.summary}</span>
          {validation.issues.length > 0 && (
            <span className="text-xs opacity-70">
              {validation.issues.length} issue{validation.issues.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Issues List (if any) */}
      {validation && validation.issues.length > 0 && (
        <div className="border-b border-white/[0.06] bg-black/20">
          {validation.issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      )}

      {/* Code View */}
      <File
        file={file}
        options={{
          theme: 'github-dark',
          disableLineNumbers: false,
          overflow: 'scroll',
          disableFileHeader: true,
        }}
        lineAnnotations={lineAnnotations}
        renderAnnotation={(annotation: LineAnnotation<ValidationIssue>) => (
          <InlineAnnotation issue={annotation.metadata!} />
        )}
        className="scene-editor-code"
      />
    </div>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const isError = issue.type === 'error'

  return (
    <div className={`
      px-4 py-1.5 text-xs flex items-center gap-3 border-b border-white/[0.04] last:border-0
      hover:bg-white/[0.02] cursor-pointer
    `}>
      <span className={`
        w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold
        ${isError ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}
      `}>
        {isError ? '✗' : '⚠'}
      </span>
      <span className="text-neutral-500 font-mono w-8">:{issue.line}</span>
      <span className="text-neutral-300">{issue.message}</span>
    </div>
  )
}

function InlineAnnotation({ issue }: { issue: ValidationIssue }) {
  const isError = issue.type === 'error'

  return (
    <div className={`
      px-3 py-1 text-xs flex items-center gap-2
      ${isError ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}
    `}>
      <span>{isError ? '✗' : '⚠'}</span>
      <span>{issue.message}</span>
    </div>
  )
}

// Simple validation badge for showing status only
export function ValidationBadge({ content }: { content: string }) {
  const validation = useMemo(() => validateScene(content), [content])

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium
      ${validation.valid
        ? 'bg-green-500/20 text-green-400'
        : validation.issues.some(i => i.type === 'error')
          ? 'bg-red-500/20 text-red-400'
          : 'bg-yellow-500/20 text-yellow-400'
      }
    `}>
      <span>{validation.valid ? '✓' : validation.issues.some(i => i.type === 'error') ? '✗' : '⚠'}</span>
      <span>{validation.valid ? 'Valid' : `${validation.issues.length} issue${validation.issues.length !== 1 ? 's' : ''}`}</span>
    </span>
  )
}
