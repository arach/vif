import { useMemo } from 'react'
import YAML from 'yaml'

interface TimelineProps {
  content: string
}

interface ParsedStep {
  type: string
  label: string
  detail?: string
  duration?: string
  icon: string
  color: string
}

const STEP_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  wait: { icon: '⏱', color: 'text-neutral-400', label: 'Wait' },
  label: { icon: '💬', color: 'text-purple-400', label: 'Label' },
  'label.update': { icon: '✏️', color: 'text-purple-400', label: 'Update Label' },
  'label.hide': { icon: '🙈', color: 'text-purple-400', label: 'Hide Label' },
  record: { icon: '⏺', color: 'text-red-400', label: 'Record' },
  'cursor.show': { icon: '↖', color: 'text-cyan-400', label: 'Show Cursor' },
  'cursor.hide': { icon: '↗', color: 'text-cyan-400', label: 'Hide Cursor' },
  'cursor.move': { icon: '↔', color: 'text-cyan-400', label: 'Move Cursor' },
  click: { icon: '👆', color: 'text-yellow-400', label: 'Click' },
  navigate: { icon: '🧭', color: 'text-green-400', label: 'Navigate' },
  'backdrop.show': { icon: '▣', color: 'text-blue-400', label: 'Show Backdrop' },
  'backdrop.hide': { icon: '▢', color: 'text-blue-400', label: 'Hide Backdrop' },
  'keys.show': { icon: '⌨', color: 'text-orange-400', label: 'Show Keys' },
  'keys.hide': { icon: '⌨', color: 'text-orange-400', label: 'Hide Keys' },
  type: { icon: '⌨', color: 'text-orange-400', label: 'Type' },
  audio: { icon: '🔊', color: 'text-pink-400', label: 'Audio' },
  'stage.center': { icon: '🪟', color: 'text-indigo-400', label: 'Center Window' },
}

function parseStep(step: unknown): ParsedStep | null {
  if (typeof step !== 'object' || step === null) return null

  const obj = step as Record<string, unknown>
  const keys = Object.keys(obj)

  for (const key of keys) {
    const config = STEP_CONFIG[key]
    if (config) {
      const value = obj[key]
      let detail: string | undefined
      let duration: string | undefined

      if (key === 'wait') {
        duration = String(value)
        detail = `Wait ${value}`
      } else if (key === 'record') {
        detail = String(value)
      } else if (key === 'label' && typeof value === 'string') {
        detail = obj.text ? String(obj.text) : value
      } else if (key === 'label.update') {
        detail = String(value)
      } else if (key === 'click') {
        detail = String(value)
      } else if (key === 'navigate' && typeof value === 'object' && value !== null) {
        const nav = value as Record<string, unknown>
        detail = `${nav.through}: ${Array.isArray(nav.items) ? nav.items.join(' → ') : ''}`
        if (nav.wait) duration = String(nav.wait)
      } else if (typeof value === 'string') {
        detail = value
      }

      return {
        type: key,
        label: config.label,
        detail,
        duration,
        icon: config.icon,
        color: config.color,
      }
    }
  }

  // Unknown step type
  const firstKey = keys[0]
  return {
    type: firstKey || 'unknown',
    label: firstKey || 'Unknown',
    detail: JSON.stringify(obj[firstKey]),
    icon: '❓',
    color: 'text-neutral-500',
  }
}

export function Timeline({ content }: TimelineProps) {
  const { scene, steps } = useMemo(() => {
    try {
      const parsed = YAML.parse(content)
      const sequence = parsed?.sequence || []
      const sceneInfo = parsed?.scene || {}

      const parsedSteps = sequence
        .map((step: unknown) => parseStep(step))
        .filter(Boolean) as ParsedStep[]

      return { scene: sceneInfo, steps: parsedSteps }
    } catch {
      return { scene: {}, steps: [] }
    }
  }, [content])

  if (steps.length === 0) {
    return (
      <div className="p-6 text-center text-neutral-500">
        <p>No sequence steps found</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Scene header */}
      {scene.name && (
        <div className="mb-4 pb-3 border-b border-white/10">
          <h3 className="font-medium text-white">{scene.name}</h3>
          {scene.mode && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-vif-accent/20 text-vif-accent mt-1 inline-block">
              {scene.mode}
            </span>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-vif-accent/50 via-purple-500/30 to-transparent" />

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((step, index) => (
            <div key={index} className="relative flex items-start gap-3 group">
              {/* Node */}
              <div
                className={`
                  relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-sm
                  bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors
                  ${step.color}
                `}
              >
                {step.icon}
              </div>

              {/* Content */}
              <div className="flex-1 py-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{step.label}</span>
                  {step.duration && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-neutral-400 font-mono">
                      {step.duration}
                    </span>
                  )}
                </div>
                {step.detail && (
                  <p className="text-xs text-neutral-500 truncate mt-0.5">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-4 text-xs text-neutral-500">
        <span>{steps.length} steps</span>
        <span>•</span>
        <span>
          {steps.filter(s => s.type === 'wait').length} waits
        </span>
        <span>•</span>
        <span>
          {steps.filter(s => s.type === 'click' || s.type === 'navigate').length} interactions
        </span>
      </div>
    </div>
  )
}
