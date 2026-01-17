import { useMemo } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import { parseDiffFromFile } from '@pierre/diffs'
import type { FileDiffMetadata, DiffLineAnnotation } from '@pierre/diffs'

// DSL-aware step types for semantic annotations
const STEP_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  'wait': { icon: '⏱', label: 'Wait', color: '#a3a3a3' },
  'label': { icon: '💬', label: 'Label', color: '#c084fc' },
  'label.update': { icon: '✏️', label: 'Update Label', color: '#c084fc' },
  'label.hide': { icon: '🙈', label: 'Hide Label', color: '#c084fc' },
  'record': { icon: '⏺', label: 'Record', color: '#f87171' },
  'cursor.show': { icon: '↖', label: 'Show Cursor', color: '#22d3ee' },
  'cursor.hide': { icon: '↗', label: 'Hide Cursor', color: '#22d3ee' },
  'click': { icon: '👆', label: 'Click', color: '#facc15' },
  'navigate': { icon: '🧭', label: 'Navigate', color: '#4ade80' },
  'voice': { icon: '🎤', label: 'Voice', color: '#f472b6' },
  'stage': { icon: '🎬', label: 'Stage', color: '#fb923c' },
}

interface SceneAnnotation {
  type: 'addition' | 'deletion' | 'modification'
  stepType?: string
  description: string
  impact?: string // e.g., "Adds 2.3s to scene duration"
}

interface SceneDiffProps {
  oldYaml: string
  newYaml: string
  sceneName?: string
  onAccept?: (newYaml: string) => void
  onReject?: () => void
  onAcceptLine?: (lineNumber: number, side: 'additions' | 'deletions') => void
}

export function SceneDiff({
  oldYaml,
  newYaml,
  sceneName = 'scene.yaml',
  onAccept,
  onReject,
  onAcceptLine,
}: SceneDiffProps) {
  // Parse the diff
  const fileDiff = useMemo<FileDiffMetadata>(() => {
    return parseDiffFromFile(
      { name: sceneName, contents: oldYaml, lang: 'yaml' },
      { name: sceneName, contents: newYaml, lang: 'yaml' }
    )
  }, [oldYaml, newYaml, sceneName])

  // Generate DSL-aware annotations
  const { annotations, summary } = useMemo(() => {
    const annotations: DiffLineAnnotation<SceneAnnotation>[] = []
    const changes: { added: string[]; removed: string[]; modified: string[] } = {
      added: [],
      removed: [],
      modified: [],
    }

    // Parse lines to detect step changes
    const oldLines = oldYaml.split('\n')
    const newLines = newYaml.split('\n')

    // Simple heuristic: look for step patterns in changed lines
    newLines.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ') && !oldLines.includes(line)) {
        // This is an added step
        const stepMatch = trimmed.match(/^-\s+(\S+):/)
        if (stepMatch) {
          const stepType = stepMatch[1]
          const config = STEP_CONFIG[stepType] || { icon: '◆', label: stepType, color: '#6b7280' }

          let description = `Added: ${config.label}`
          let impact: string | undefined

          // Parse specific step details
          if (stepType === 'wait') {
            const waitMatch = trimmed.match(/wait:\s*(\d+(?:ms|s|m)?)/)
            if (waitMatch) {
              description = `Added ${waitMatch[1]} pause`
              impact = `Extends scene by ${waitMatch[1]}`
            }
          } else if (stepType === 'click') {
            const targetMatch = trimmed.match(/click:\s*(.+)/)
            if (targetMatch) {
              description = `Added click on ${targetMatch[1]}`
            }
          } else if (stepType === 'navigate') {
            description = `Added navigation sequence`
          }

          annotations.push({
            side: 'additions',
            lineNumber: index + 1,
            metadata: {
              type: 'addition',
              stepType,
              description,
              impact,
            },
          })
          changes.added.push(config.label)
        }
      }
    })

    oldLines.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ') && !newLines.includes(line)) {
        // This is a removed step
        const stepMatch = trimmed.match(/^-\s+(\S+):/)
        if (stepMatch) {
          const stepType = stepMatch[1]
          const config = STEP_CONFIG[stepType] || { icon: '◆', label: stepType, color: '#6b7280' }

          annotations.push({
            side: 'deletions',
            lineNumber: index + 1,
            metadata: {
              type: 'deletion',
              stepType,
              description: `Removed: ${config.label}`,
            },
          })
          changes.removed.push(config.label)
        }
      }
    })

    // Generate summary
    const summaryParts: string[] = []
    if (changes.added.length > 0) {
      summaryParts.push(`+${changes.added.length} step${changes.added.length > 1 ? 's' : ''}`)
    }
    if (changes.removed.length > 0) {
      summaryParts.push(`-${changes.removed.length} step${changes.removed.length > 1 ? 's' : ''}`)
    }

    return {
      annotations,
      summary: summaryParts.join(', ') || 'No changes detected',
    }
  }, [oldYaml, newYaml])

  // Check if there are any changes
  const hasChanges = oldYaml !== newYaml

  if (!hasChanges) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-3xl mb-3 opacity-50">✓</div>
        <p className="text-neutral-400">No changes to review</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-neutral-300">Changes</span>
          <span className="text-xs bg-white/10 text-neutral-400 px-2 py-1 rounded">
            {summary}
          </span>
        </div>
        {(onAccept || onReject) && (
          <div className="flex items-center gap-2">
            {onReject && (
              <button
                onClick={onReject}
                className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                Reject All
              </button>
            )}
            {onAccept && (
              <button
                onClick={() => onAccept(newYaml)}
                className="px-3 py-1.5 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors"
              >
                Accept All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Diff viewer */}
      <div className="rounded-lg overflow-hidden border border-white/[0.06]">
        <FileDiff
          fileDiff={fileDiff}
          options={{
            theme: 'github-dark',
            diffStyle: 'unified',
            diffIndicators: 'bars',
            overflow: 'wrap',
            lineDiffType: 'word',
            disableFileHeader: true,
          }}
          lineAnnotations={annotations}
          renderAnnotation={(annotation: DiffLineAnnotation<SceneAnnotation>) => (
            <AnnotationBadge annotation={annotation} onAcceptLine={onAcceptLine} />
          )}
          className="scene-diff"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-neutral-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500/30 border-l-2 border-green-500" />
          <span>Added</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/30 border-l-2 border-red-500" />
          <span>Removed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500/30 border-l-2 border-yellow-500" />
          <span>Modified</span>
        </div>
      </div>
    </div>
  )
}

function AnnotationBadge({
  annotation,
  onAcceptLine
}: {
  annotation: DiffLineAnnotation<SceneAnnotation>
  onAcceptLine?: (lineNumber: number, side: 'additions' | 'deletions') => void
}) {
  const meta = annotation.metadata
  if (!meta) return null

  const config = meta.stepType ? STEP_CONFIG[meta.stepType] : null
  const isAddition = meta.type === 'addition'

  return (
    <div className={`
      flex items-center gap-2 px-3 py-2 text-xs
      ${isAddition ? 'bg-green-500/5 border-l-2 border-green-500' : 'bg-red-500/5 border-l-2 border-red-500'}
    `}>
      {config && <span>{config.icon}</span>}
      <span className="text-neutral-300">{meta.description}</span>
      {meta.impact && (
        <span className="text-neutral-500 ml-2">({meta.impact})</span>
      )}
      {onAcceptLine && (
        <button
          onClick={() => onAcceptLine(annotation.lineNumber, annotation.side)}
          className={`
            ml-auto px-2 py-0.5 rounded text-[10px] font-medium transition-colors
            ${isAddition
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}
          `}
        >
          {isAddition ? 'Accept' : 'Keep'}
        </button>
      )}
    </div>
  )
}

// CSS for the diff viewer (can be added to global styles)
export const sceneDiffStyles = `
  .scene-diff {
    font-size: 13px;
    line-height: 1.5;
  }
  .scene-diff [data-pierre-diffs] {
    background: rgba(0, 0, 0, 0.3) !important;
  }
`
