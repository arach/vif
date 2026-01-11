"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "./icons"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const cliExamples = [
  {
    title: "Render a storyboard",
    command: "vif render storyboard.yaml",
    description: "Render declarative video"
  },
  {
    title: "Create a take",
    command: "vif take new demo.mp4 \"shortened intro\"",
    description: "Version your assets"
  },
  {
    title: "Mix audio",
    command: "vif mix video.mp4 music.mp3 out.mp4 --volume 0.7 --fade-out 2",
    description: "Add music with fades"
  },
  {
    title: "Analyze audio",
    command: "vif analyze music.mp3 --bpm 120",
    description: "Get beats for sync"
  },
  {
    title: "Screenshot an app",
    command: "vif shot --app Safari output.png",
    description: "Capture any window"
  }
]

const storyboardExample = `# storyboard.yaml - Agent edits this file
name: product-demo
output: final.mp4

audio:
  file: background-music.mp3
  volume: 0.6
  fadeIn: 1
  fadeOut: 2

sequence:
  - source: intro-screen.mp4
    duration: 3

  - source: feature-showcase.mp4
    transition: crossfade

  - source: call-to-action.mp4
    duration: 5`

const agentWorkflowExample = `# Your agent can iterate on video production:

# 1. Agent creates/edits storyboard.yaml
# 2. Agent runs:
vif render storyboard.yaml

# 3. Agent reviews output, creates a take:
vif take new final.mp4 "v1 - initial cut"

# 4. Agent adjusts storyboard.yaml
# 5. Agent re-renders and compares
vif render storyboard.yaml
vif take list final.mp4`

export default function QuickStartSection() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyCommand = async (command: string, id: string) => {
    await navigator.clipboard.writeText(command)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section className="py-12 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extralight mb-3 text-slate-900">
            Agent<span className="font-light bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent"> Workflow</span>
          </h2>
          <p className="font-text text-base text-slate-600 max-w-2xl mx-auto font-light">
            Everything is a file. Your agent edits YAML, runs commands, and iterates through conversation.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* CLI Commands */}
          <div>
            <h3 className="font-display text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">1</span>
              CLI Commands
            </h3>
            <div className="space-y-3">
              {cliExamples.map((example, index) => (
                <div key={index} className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                    <span className="text-slate-400 text-xs">{example.title}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCommand(example.command, `cli-${index}`)}
                      className="text-slate-400 hover:text-white hover:bg-slate-700 h-5 w-5 p-0 rounded"
                    >
                      {copied === `cli-${index}` ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  <SyntaxHighlighter
                    language="bash"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: '8px 12px',
                      background: 'transparent',
                      fontSize: '0.7rem',
                      lineHeight: '1.4'
                    }}
                    codeTagProps={{
                      style: {
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace'
                      }
                    }}
                  >
                    {example.command}
                  </SyntaxHighlighter>
                </div>
              ))}
            </div>
          </div>

          {/* Storyboard Example */}
          <div>
            <h3 className="font-display text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
              Storyboard File
            </h3>
            <div className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-slate-400 text-xs">storyboard.yaml</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCommand(storyboardExample, 'storyboard')}
                  className="text-slate-400 hover:text-white hover:bg-slate-700 h-5 w-5 p-0 rounded"
                >
                  {copied === 'storyboard' ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
              <SyntaxHighlighter
                language="yaml"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '12px 16px',
                  background: 'transparent',
                  fontSize: '0.65rem',
                  lineHeight: '1.5'
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace'
                  }
                }}
              >
                {storyboardExample}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>

        {/* Agent workflow */}
        <div className="mt-8">
          <h3 className="font-display text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-xs font-bold">3</span>
            Iterate Through Conversation
          </h3>
          <div className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
              <span className="text-slate-400 text-xs">Agent iteration loop</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCommand(agentWorkflowExample, 'workflow')}
                className="text-slate-400 hover:text-white hover:bg-slate-700 h-5 w-5 p-0 rounded"
              >
                {copied === 'workflow' ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
            <SyntaxHighlighter
              language="bash"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '12px 16px',
                background: 'transparent',
                fontSize: '0.7rem',
                lineHeight: '1.5'
              }}
              codeTagProps={{
                style: {
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace'
                }
              }}
            >
              {agentWorkflowExample}
            </SyntaxHighlighter>
          </div>
        </div>

        {/* Requirements */}
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">
            <span className="font-medium">Requirements:</span> macOS, Node.js 18+, ffmpeg (for video processing)
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Install ffmpeg: <code className="bg-slate-100 px-1.5 py-0.5 rounded">brew install ffmpeg</code>
          </p>
        </div>
      </div>
    </section>
  )
}
