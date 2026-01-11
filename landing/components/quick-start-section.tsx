"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "./icons"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const examples = [
  {
    title: "Screenshot an app",
    command: "vif shot --app Safari output.png",
    description: "Capture any app window by name"
  },
  {
    title: "Record your screen",
    command: "vif record demo.mp4 --duration 10",
    description: "Record for 10 seconds"
  },
  {
    title: "Create a GIF",
    command: "vif gif demo.mp4 demo.gif --width 600 --fps 15",
    description: "Convert video to animated GIF"
  },
  {
    title: "List all windows",
    command: "vif windows",
    description: "See all capturable windows"
  },
  {
    title: "Optimize for web",
    command: "vif optimize raw.mov web.mp4 --width 1280",
    description: "Downscale and compress"
  }
]

const libraryExample = `import { screenshotApp, recordVideo, videoToGif } from '@arach/vif';

// Screenshot Safari window
screenshotApp('Safari', './safari.png');

// Record for 10 seconds
await recordVideo({
  output: './demo.mp4',
  duration: 10
});

// Convert to GIF
videoToGif('./demo.mp4', './demo.gif', {
  width: 480,
  fps: 10
});`

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
            Quick<span className="font-light bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent"> Start</span>
          </h2>
          <p className="font-text text-base text-slate-600 max-w-2xl mx-auto font-light">
            Get started in seconds. Use the CLI or import as a library.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* CLI Examples */}
          <div>
            <h3 className="font-display text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold">1</span>
              CLI Commands
            </h3>
            <div className="space-y-3">
              {examples.map((example, index) => (
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

          {/* Library Example */}
          <div>
            <h3 className="font-display text-lg font-medium text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center text-xs font-bold">2</span>
              Library Usage
            </h3>
            <div className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden h-[calc(100%-2rem)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-slate-400 text-xs">TypeScript</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCommand(libraryExample, 'library')}
                  className="text-slate-400 hover:text-white hover:bg-slate-700 h-5 w-5 p-0 rounded"
                >
                  {copied === 'library' ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
              <SyntaxHighlighter
                language="typescript"
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
                {libraryExample}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>

        {/* Requirements */}
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">
            <span className="font-medium">Requirements:</span> macOS, Node.js 18+, ffmpeg (optional, for video processing)
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Install ffmpeg: <code className="bg-slate-100 px-1.5 py-0.5 rounded">brew install ffmpeg</code>
          </p>
        </div>
      </div>
    </section>
  )
}
