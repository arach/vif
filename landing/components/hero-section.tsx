"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check, Camera, Video, Terminal } from "./icons"
import { Github } from "lucide-react"
import Link from "next/link"
import PackageManagerTabs from "@/components/package-manager-tabs"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function CodeDemo() {
  const [copied, setCopied] = useState(false)
  const [showDemo, setShowDemo] = useState(false)

  const cliCommand = `vif shot --app Safari safari.png`

  const copyCommand = async () => {
    await navigator.clipboard.writeText(cliCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={() => setShowDemo(!showDemo)}
        className="h-10 px-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-full font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
      >
        <Terminal className="w-4 h-4 mr-2" />
        {showDemo ? 'Hide CLI Demo' : 'See CLI in Action'}
      </Button>

      <div className={`transition-all duration-500 ease-in-out overflow-hidden ${
        showDemo
          ? 'max-h-96 opacity-100 transform translate-y-0'
          : 'max-h-0 opacity-0 transform -translate-y-4'
      }`}>
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-full max-w-md">
            <div className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-sm">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="ml-2 text-slate-500 text-xs">Terminal</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCommand}
                className="absolute top-8 right-2 text-slate-400 hover:text-white hover:bg-slate-700 h-6 w-6 p-0 rounded-md z-10"
                title={copied ? "Copied!" : "Copy to clipboard"}
              >
                {copied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
              <SyntaxHighlighter
                language="bash"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '12px 16px',
                  background: 'transparent',
                  fontSize: '0.75rem',
                  lineHeight: '1.4',
                  fontWeight: '300',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontWeight: '300',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word'
                  }
                }}
                wrapLines={true}
                wrapLongLines={true}
              >
                {`$ ${cliCommand}\nCapturing Safari window...\nScreenshot saved: safari.png`}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HeroSection() {
  return (
    <>
      <section className="relative py-8 md:py-16 flex items-center justify-center px-4 overflow-hidden">
        {/* Subtle background elements */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(236,72,153,0.05),transparent_50%)]" />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* GitHub link */}
          <div className="mb-4 flex justify-center">
            <Link
              href="https://github.com/arach/vif"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-xs font-medium transition-all duration-200 hover:scale-105"
            >
              <Github className="w-3.5 h-3.5" />
              Star on GitHub
            </Link>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl mb-2 md:mb-3 text-slate-900 leading-[0.9] tracking-tight">
            <span className="font-silkscreen">Vif</span>
            <br />
            <span className="font-display font-light bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              Vivid Capture
            </span>
          </h1>

          <div className="font-text text-sm sm:text-base md:text-lg mb-4 md:mb-6 max-w-2xl mx-auto leading-relaxed font-light px-4">
            <p className="text-slate-600">
              Screenshots, video recording, and GIF creation for macOS.
              <br className="hidden sm:block" />
              <span className="text-slate-500">One CLI to capture it all.</span>
            </p>
          </div>

          {/* Feature pills */}
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 border border-violet-200/50 rounded-full text-xs text-violet-700">
              <Camera className="w-3 h-3" />
              Screenshots
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-fuchsia-50 border border-fuchsia-200/50 rounded-full text-xs text-fuchsia-700">
              <Video className="w-3 h-3" />
              Video Recording
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-50 border border-pink-200/50 rounded-full text-xs text-pink-700">
              <span className="text-sm">GIF</span>
              Animated GIFs
            </div>
          </div>

          {/* Demo Command */}
          <div className="mb-6 flex justify-center">
            <CodeDemo />
          </div>

          <div className="flex flex-col items-center">
            <PackageManagerTabs />
          </div>
        </div>
      </section>
    </>
  )
}
