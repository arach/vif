"use client"

import { Badge } from "@/components/ui/badge"
import { Bot, FileText, Puzzle, ExternalLink, Code } from "lucide-react"
import Link from "next/link"

export default function AgentSection() {
  return (
    <section id="agents" className="py-16 px-4 bg-gradient-to-b from-slate-50/50 to-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-4 border-emerald-200 text-emerald-700 bg-emerald-50/50 rounded-xl">
            Agent-Ready
          </Badge>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extralight mb-3 text-slate-900">
            Built for <span className="font-light bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">AI Agents</span>
          </h2>
          <p className="font-text text-base text-slate-600 max-w-2xl mx-auto font-light">
            Vif ships with agent enablement files. Any AI coding agent can understand, modify, and extend vif instantly.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* INTEGRATION.md Card */}
          <Link
            href="https://github.com/arach/vif/blob/main/INTEGRATION.md"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-purple-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-purple-100 transition-colors">
                <Code className="w-6 h-6 text-slate-600 group-hover:text-purple-600 transition-colors" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display text-lg font-medium text-slate-900">Integration Guide</h3>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-purple-500 transition-colors" />
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Single source of truth for integrating your macOS app. VifTargets SDK, Swift code, coordinate conversion.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Swift SDK</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">SwiftUI</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Voice</span>
                </div>
              </div>
            </div>
          </Link>

          {/* AGENTS.md Card */}
          <Link
            href="https://github.com/arach/vif/blob/main/AGENTS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-emerald-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-emerald-100 transition-colors">
                <FileText className="w-6 h-6 text-slate-600 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display text-lg font-medium text-slate-900">AGENTS.md</h3>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Cross-agent instructions for Claude Code, Cursor, Copilot, Gemini CLI, and any AI coding agent.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Setup</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Architecture</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">DSL</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Claude Skill Card */}
          <Link
            href="https://github.com/arach/vif/blob/main/.claude/skills/vif/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-blue-100 transition-colors">
                <Puzzle className="w-6 h-6 text-slate-600 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display text-lg font-medium text-slate-900">Claude Skill</h3>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Auto-discovered by Claude Code. Comprehensive VifTargets implementation guide.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Auto-load</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Coordinates</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">MCP</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Agentic Control callout */}
        <div className="mt-8 p-6 bg-gradient-to-r from-slate-50 to-emerald-50 border border-slate-200/50 rounded-2xl">
          <div className="flex items-start gap-4">
            <Bot className="w-6 h-6 text-slate-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-slate-900 mb-1">Programmatic Control</h4>
              <p className="text-sm text-slate-600 mb-3">
                Control vif imperatively with <code className="font-mono text-xs bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">vif-ctl</code> CLI
                or the <code className="font-mono text-xs bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">vif-mcp</code> MCP server for Claude.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <code className="text-xs bg-white/80 px-2 py-1 rounded font-mono text-slate-600 border border-slate-200">vif-ctl cursor move 500 300</code>
                <code className="text-xs bg-white/80 px-2 py-1 rounded font-mono text-slate-600 border border-slate-200">vif-ctl panel headless on</code>
              </div>
              <p className="text-xs text-slate-500">
                Keyboard: <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">Escape</kbd> exits headless,
                <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px] ml-1">⌃⌥⌘V</kbd> toggles headless
              </p>
            </div>
          </div>
        </div>

        {/* Integration callout */}
        <div className="mt-4 p-6 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200/50 rounded-2xl">
          <div className="flex items-start gap-4">
            <Code className="w-6 h-6 text-purple-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-slate-900 mb-1">Integrate your app with vif</h4>
              <p className="text-sm text-slate-600 mb-3">
                Two paths: use explicit coordinates for any app, or integrate the VifTargets SDK for dynamic UI element tracking.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="text-xs bg-white/80 px-3 py-1.5 rounded-lg font-mono text-slate-700 border border-slate-200">
                  curl http://localhost:7851/vif/targets | jq
                </code>
                <Link
                  href="https://github.com/arach/vif/blob/main/INTEGRATION.md"
                  target="_blank"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                >
                  Read the guide <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
