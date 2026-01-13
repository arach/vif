"use client"

import { Badge } from "@/components/ui/badge"
import { Bot, FileText, Puzzle, ExternalLink } from "lucide-react"
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

        <div className="grid md:grid-cols-2 gap-6">
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
                  Cross-agent compatible instructions. Works with Claude Code, Cursor, Copilot, Gemini CLI, and any AI coding agent.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Setup commands</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Architecture</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">DSL reference</span>
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
                  Auto-discovered by Claude Code. Complete VifTargets SDK implementation, SwiftUI modifiers, and integration guide.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Swift SDK</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Coordinates</span>
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Voice injection</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Integration callout */}
        <div className="mt-8 p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50 rounded-2xl">
          <div className="flex items-start gap-4">
            <Bot className="w-6 h-6 text-emerald-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-slate-900 mb-1">Integrate your app with vif</h4>
              <p className="text-sm text-slate-600 mb-3">
                Expose your app's UI elements via HTTP on port 7851. Navigation targets use the API, click targets use screen coordinates.
              </p>
              <code className="text-xs bg-white/80 px-3 py-1.5 rounded-lg font-mono text-slate-700 border border-slate-200">
                curl http://localhost:7851/vif/targets | jq
              </code>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
