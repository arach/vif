/**
 * Lightweight vif scene validator
 *
 * Provides simple pass/fail feedback on scene YAML
 */

export interface ValidationIssue {
  line: number
  type: 'error' | 'warning'
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  summary: string
}

// Known vif actions
const KNOWN_ACTIONS = new Set([
  'wait',
  'label',
  'label.show',
  'label.update',
  'label.hide',
  'cursor.show',
  'cursor.hide',
  'cursor.moveTo',
  'click',
  'doubleClick',
  'rightClick',
  'navigate',
  'record',
  'record.start',
  'record.stop',
  'stage',
  'stage.set',
  'stage.clear',
  'stage.center',
  'viewport',
  'viewport.set',
  'viewport.show',
  'viewport.hide',
  'keys',
  'keys.show',
  'keys.hide',
  'typer',
  'typer.type',
  'voice',
  'voice.play',
  'input',
  'input.type',
])

// Duration pattern (e.g., 500ms, 2s, 1.5s, 1m)
const DURATION_PATTERN = /^\d+(\.\d+)?(ms|s|m)$/

export function validateScene(yaml: string): ValidationResult {
  const issues: ValidationIssue[] = []
  const lines = yaml.split('\n')

  let hasScene = false
  let hasSequence = false
  let inSequence = false
  let sequenceStartLine = -1
  let stepCount = 0

  lines.forEach((line, index) => {
    const lineNum = index + 1
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return

    // Check for scene block
    if (trimmed.startsWith('scene:')) {
      hasScene = true
      return
    }

    // Check for sequence block
    if (trimmed.startsWith('sequence:')) {
      hasSequence = true
      inSequence = true
      sequenceStartLine = lineNum
      return
    }

    // Check sequence items
    if (inSequence && trimmed.startsWith('-')) {
      stepCount++

      // Extract action name
      const actionMatch = trimmed.match(/^-\s+(\S+):/)
      if (actionMatch) {
        const action = actionMatch[1]

        // Check if action is known
        if (!KNOWN_ACTIONS.has(action)) {
          // Check for close matches (typos)
          const suggestion = findClosestAction(action)
          if (suggestion) {
            issues.push({
              line: lineNum,
              type: 'error',
              message: `Unknown action '${action}'. Did you mean '${suggestion}'?`
            })
          } else {
            issues.push({
              line: lineNum,
              type: 'warning',
              message: `Unknown action '${action}'`
            })
          }
        }

        // Validate wait durations
        if (action === 'wait') {
          const durationMatch = trimmed.match(/wait:\s*(.+)/)
          if (durationMatch) {
            const duration = durationMatch[1].trim()
            if (!DURATION_PATTERN.test(duration)) {
              issues.push({
                line: lineNum,
                type: 'error',
                message: `Invalid duration '${duration}'. Use format like '500ms', '2s', or '1m'`
              })
            } else {
              // Check for very long waits
              const ms = parseDuration(duration)
              if (ms > 30000) {
                issues.push({
                  line: lineNum,
                  type: 'warning',
                  message: `Long wait (${duration}). Intentional?`
                })
              }
            }
          }
        }

        // Check for empty values
        const valueMatch = trimmed.match(/^-\s+\S+:\s*(.*)$/)
        if (valueMatch) {
          const value = valueMatch[1].trim()
          if (!value && !['cursor.show', 'cursor.hide', 'label.hide', 'record.stop', 'stage.clear'].includes(action)) {
            // Check if it's a multi-line value (next line is indented more)
            const nextLine = lines[index + 1]
            if (!nextLine || !nextLine.match(/^\s{4,}/)) {
              issues.push({
                line: lineNum,
                type: 'warning',
                message: `Empty value for '${action}'`
              })
            }
          }
        }
      }
    }
  })

  // Top-level structure validation
  if (!hasScene) {
    issues.unshift({
      line: 1,
      type: 'warning',
      message: "Missing 'scene:' block"
    })
  }

  if (!hasSequence) {
    issues.unshift({
      line: 1,
      type: 'error',
      message: "Missing 'sequence:' block - no steps to run"
    })
  }

  if (hasSequence && stepCount === 0) {
    issues.push({
      line: sequenceStartLine,
      type: 'warning',
      message: "Sequence is empty"
    })
  }

  // Generate summary
  const errorCount = issues.filter(i => i.type === 'error').length
  const warningCount = issues.filter(i => i.type === 'warning').length

  let summary: string
  if (errorCount === 0 && warningCount === 0) {
    summary = `✓ Valid scene with ${stepCount} step${stepCount !== 1 ? 's' : ''}`
  } else if (errorCount === 0) {
    summary = `⚠ ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
  } else {
    summary = `✗ ${errorCount} error${errorCount !== 1 ? 's' : ''}${warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}`
  }

  return {
    valid: errorCount === 0,
    issues,
    summary
  }
}

function findClosestAction(input: string): string | null {
  let bestMatch: string | null = null
  let bestDistance = Infinity

  for (const action of KNOWN_ACTIONS) {
    const distance = levenshteinDistance(input.toLowerCase(), action.toLowerCase())
    if (distance < bestDistance && distance <= 2) {
      bestDistance = distance
      bestMatch = action
    }
  }

  return bestMatch
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m)$/)
  if (!match) return 0

  const value = parseFloat(match[1])
  const unit = match[2]

  switch (unit) {
    case 'ms': return value
    case 's': return value * 1000
    case 'm': return value * 60000
    default: return 0
  }
}
