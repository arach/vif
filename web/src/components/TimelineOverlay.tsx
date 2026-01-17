import { useEffect, useState, useRef } from 'react'
import YAML from 'yaml'

interface TimelineOverlayProps {
  sceneYaml?: string
  currentStep?: number
  wsUrl?: string
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
  wait: { icon: '⏱', color: '#a3a3a3', label: 'Wait' },
  label: { icon: '💬', color: '#c084fc', label: 'Label' },
  'label.update': { icon: '✏️', color: '#c084fc', label: 'Update' },
  'label.hide': { icon: '🙈', color: '#c084fc', label: 'Hide Label' },
  record: { icon: '⏺', color: '#f87171', label: 'Record' },
  'cursor.show': { icon: '↖', color: '#22d3ee', label: 'Cursor' },
  'cursor.hide': { icon: '↗', color: '#22d3ee', label: 'Hide Cursor' },
  'cursor.move': { icon: '↔', color: '#22d3ee', label: 'Move' },
  click: { icon: '👆', color: '#facc15', label: 'Click' },
  navigate: { icon: '🧭', color: '#4ade80', label: 'Navigate' },
  'backdrop.show': { icon: '▣', color: '#60a5fa', label: 'Backdrop' },
  'backdrop.hide': { icon: '▢', color: '#60a5fa', label: 'Hide Backdrop' },
  'keys.show': { icon: '⌨', color: '#fb923c', label: 'Keys' },
  'keys.hide': { icon: '⌨', color: '#fb923c', label: 'Hide Keys' },
  type: { icon: '⌨', color: '#fb923c', label: 'Type' },
  audio: { icon: '🔊', color: '#f472b6', label: 'Audio' },
  'stage.center': { icon: '🪟', color: '#818cf8', label: 'Center' },
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
        detail = String(value)
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
        detail = Array.isArray(nav.items) ? nav.items.join(' → ') : String(nav.through || '')
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

  const firstKey = keys[0]
  return {
    type: firstKey || 'unknown',
    label: firstKey || 'Step',
    detail: undefined,
    icon: '◆',
    color: '#6b7280',
  }
}

export function TimelineOverlay({ sceneYaml, currentStep = -1, wsUrl }: TimelineOverlayProps) {
  const [steps, setSteps] = useState<ParsedStep[]>([])
  const [sceneName, setSceneName] = useState('')
  const [activeStep, setActiveStep] = useState(currentStep)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const activeRef = useRef<HTMLDivElement>(null)

  // Parse YAML when it changes
  useEffect(() => {
    if (!sceneYaml) return

    try {
      const parsed = YAML.parse(sceneYaml)
      const sequence = parsed?.sequence || []
      setSceneName(parsed?.scene?.name || 'Scene')

      const parsedSteps = sequence
        .map((step: unknown) => parseStep(step))
        .filter(Boolean) as ParsedStep[]

      setSteps(parsedSteps)
      setActiveStep(-1)
      setCompletedSteps(new Set())
    } catch {
      // Ignore parse errors
    }
  }, [sceneYaml])

  // Connect to WebSocket for live updates
  useEffect(() => {
    if (!wsUrl) return

    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.event === 'step.start') {
          setActiveStep(data.index)
        } else if (data.event === 'step.complete') {
          setCompletedSteps(prev => new Set([...prev, data.index]))
        } else if (data.event === 'scene.start' && data.yaml) {
          // New scene started, parse it
          try {
            const parsed = YAML.parse(data.yaml)
            const sequence = parsed?.sequence || []
            setSceneName(parsed?.scene?.name || 'Scene')

            const parsedSteps = sequence
              .map((step: unknown) => parseStep(step))
              .filter(Boolean) as ParsedStep[]

            setSteps(parsedSteps)
            setActiveStep(-1)
            setCompletedSteps(new Set())
          } catch {
            // Ignore
          }
        } else if (data.event === 'scene.complete') {
          // Mark all as complete
          setActiveStep(-1)
        }
      } catch {
        // Ignore non-JSON messages
      }
    }

    return () => ws.close()
  }, [wsUrl])

  // Auto-scroll to active step
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeStep])

  // Update from prop
  useEffect(() => {
    if (currentStep >= 0) {
      setActiveStep(currentStep)
    }
  }, [currentStep])

  if (steps.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.dot} />
          <span style={styles.title}>Timeline</span>
        </div>
        <div style={styles.empty}>No scene loaded</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.dot} />
        <span style={styles.title}>{sceneName}</span>
      </div>

      {/* Steps */}
      <div style={styles.stepsContainer}>
        {steps.map((step, index) => {
          const isActive = index === activeStep
          const isCompleted = completedSteps.has(index) || index < activeStep
          const isPending = index > activeStep && activeStep >= 0

          return (
            <div
              key={index}
              ref={isActive ? activeRef : undefined}
              style={{
                ...styles.step,
                ...(isActive ? styles.stepActive : {}),
                ...(isCompleted ? styles.stepCompleted : {}),
                ...(isPending ? styles.stepPending : {}),
              }}
            >
              {/* Connector line */}
              {index > 0 && (
                <div
                  style={{
                    ...styles.connector,
                    backgroundColor: isCompleted ? '#4ade80' : '#3f3f46',
                  }}
                />
              )}

              {/* Step node */}
              <div
                style={{
                  ...styles.node,
                  backgroundColor: isActive ? step.color : isCompleted ? '#4ade80' : '#27272a',
                  borderColor: isActive ? step.color : isCompleted ? '#4ade80' : '#3f3f46',
                  boxShadow: isActive ? `0 0 12px ${step.color}` : 'none',
                }}
              >
                {isCompleted && !isActive ? '✓' : step.icon}
              </div>

              {/* Step content */}
              <div style={styles.stepContent}>
                <div style={styles.stepLabel}>{step.label}</div>
                {step.detail && (
                  <div style={styles.stepDetail}>{step.detail}</div>
                )}
              </div>

              {/* Duration badge */}
              {step.duration && (
                <div style={styles.duration}>{step.duration}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        {activeStep >= 0 ? (
          <span>{activeStep + 1} / {steps.length}</span>
        ) : completedSteps.size > 0 ? (
          <span>✓ Complete</span>
        ) : (
          <span>{steps.length} steps</span>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '280px',
    height: '100vh',
    backgroundColor: 'rgba(9, 9, 11, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    color: '#fff',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#4ade80',
    boxShadow: '0 0 8px #4ade80',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    opacity: 0.9,
  },
  stepsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  },
  step: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    paddingBottom: '20px',
    transition: 'all 0.3s ease',
  },
  stepActive: {
    transform: 'scale(1.02)',
  },
  stepCompleted: {
    opacity: 0.6,
  },
  stepPending: {
    opacity: 0.4,
  },
  connector: {
    position: 'absolute',
    left: '15px',
    top: '-12px',
    width: '2px',
    height: '12px',
    transition: 'background-color 0.3s ease',
  },
  node: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    border: '2px solid',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
    paddingTop: '4px',
  },
  stepLabel: {
    fontSize: '13px',
    fontWeight: 500,
  },
  stepDetail: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  duration: {
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '13px',
  },
}

// Standalone page for embedding in WKWebView
export function TimelineOverlayPage() {
  const [yaml, setYaml] = useState('')
  const [step, setStep] = useState(-1)

  useEffect(() => {
    // Get params from URL
    const params = new URLSearchParams(window.location.search)
    const wsPort = params.get('port') || '7850'

    // Connect to vif server
    const ws = new WebSocket(`ws://localhost:${wsPort}`)

    ws.onopen = () => {
      // Request current scene
      ws.send(JSON.stringify({ action: 'timeline.subscribe' }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'timeline.scene') {
          setYaml(data.yaml)
          setStep(-1)
        } else if (data.event === 'timeline.step') {
          setStep(data.index)
        }
      } catch {
        // Ignore
      }
    }

    return () => ws.close()
  }, [])

  return <TimelineOverlay sceneYaml={yaml} currentStep={step} />
}
