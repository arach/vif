"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check, Terminal } from "./icons"
import { Github, Bot, FileCode, Sparkles } from "lucide-react"
import Link from "next/link"
import PackageManagerTabs from "@/components/package-manager-tabs"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function StoryboardDemo() {
  const [copied, setCopied] = useState(false)
  const [showDemo, setShowDemo] = useState(false)

  const storyboardYaml = `name: product-demo
output: demo.mp4
audio:
  file: music.mp3
  volume: 0.7
  fadeOut: 2
sequence:
  - source: intro.mp4
    duration: 3
  - source: features.mp4
    transition: crossfade`

  const copyCommand = async () => {
    await navigator.clipboard.writeText(storyboardYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={() => setShowDemo(!showDemo)}
        className="h-10 px-6 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white rounded-full font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
      >
        <FileCode className="w-4 h-4 mr-2" />
        {showDemo ? 'Hide Storyboard' : 'See Declarative Storyboard'}
      </Button>

      <div className={`transition-all duration-500 ease-in-out overflow-hidden ${
        showDemo
          ? 'max-h-[500px] opacity-100 transform translate-y-0'
          : 'max-h-0 opacity-0 transform -translate-y-4'
      }`}>
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-full max-w-md">
            <div className="relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-sm">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="ml-2 text-slate-500 text-xs">storyboard.yaml</span>
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
                language="yaml"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '12px 16px',
                  background: 'transparent',
                  fontSize: '0.7rem',
                  lineHeight: '1.5',
                  fontWeight: '300',
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontWeight: '300',
                  }
                }}
              >
                {storyboardYaml}
              </SyntaxHighlighter>
            </div>
            <p className="text-center text-xs text-slate-500 mt-2">
              Then run: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-emerald-600">vif render storyboard.yaml</code>
            </p>
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.03),transparent_50%)]" />

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

          <h1 className="text-4xl sm:text-5xl md:text-6xl mb-2 md:mb-3 text-slate-900 leading-[0.9] tracking-tight font-fraunces">
            <span className="font-bold">Vif</span>
            <br />
            <span className="font-normal bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              Declarative Screen Capture
            </span>
          </h1>

          <div className="font-fraunces text-base sm:text-lg md:text-xl mb-4 md:mb-6 max-w-2xl mx-auto leading-relaxed px-4">
            <p className="text-slate-600 font-light">
              Agentic Asset Generation
              <br className="hidden sm:block" />
              <span className="text-slate-500 italic">CLI-native. Everything is a file. Built for AI agents.</span>
            </p>
          </div>

          {/* Core pillars */}
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200/50 rounded-full text-xs text-emerald-700 font-medium">
              <Bot className="w-3.5 h-3.5" />
              Agent-First
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200/50 rounded-full text-xs text-blue-700 font-medium">
              <FileCode className="w-3.5 h-3.5" />
              Declarative
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 border border-cyan-200/50 rounded-full text-xs text-cyan-700 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              LLM-Ready
            </div>
          </div>

          {/* Philosophy statement */}
          <div className="mb-6 max-w-xl mx-auto">
            <p className="font-fraunces text-sm text-slate-500 leading-relaxed">
              Storyboards are YAML. Configs are files. Assets have versions.
              <br className="hidden sm:block" />
              <span className="italic">Let your agent iterate on video production through conversation.</span>
            </p>
          </div>

          {/* Storyboard Demo */}
          <div className="mb-6 flex justify-center">
            <StoryboardDemo />
          </div>

          <div className="flex flex-col items-center">
            <PackageManagerTabs />
          </div>
        </div>
      </section>
    </>
  )
}
