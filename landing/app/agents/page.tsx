import { Metadata } from "next"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Bot,
  FileText,
  Puzzle,
  ExternalLink,
  Terminal,
  Globe,
  Code,
  ArrowLeft
} from "lucide-react"

export const metadata: Metadata = {
  title: "Vif for Agents",
  description: "Agent enablement for vif. AGENTS.md, Claude Skills, and integration guides for AI coding agents.",
}

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-fraunces font-bold text-slate-900">Vif</span>
          </Link>
          <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50/50">
            <Bot className="w-3 h-3 mr-1" />
            Agent Docs
          </Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-2xl mb-6">
            <Bot className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extralight mb-4 text-slate-900">
            Vif for <span className="font-light bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">Agents</span>
          </h1>
          <p className="font-text text-lg text-slate-600 max-w-2xl mx-auto font-light">
            Everything an AI coding agent needs to understand, use, and extend vif.
          </p>
        </div>

        {/* Quick Access for Agents */}
        <div className="mb-12 p-6 bg-slate-900 rounded-2xl text-white">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <span className="font-mono text-sm text-slate-400">Quick Access</span>
          </div>
          <div className="space-y-3 font-mono text-sm">
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 shrink-0">AGENTS.md</span>
              <a
                href="https://raw.githubusercontent.com/arach/vif/main/AGENTS.md"
                className="text-blue-400 hover:text-blue-300 break-all"
              >
                https://raw.githubusercontent.com/arach/vif/main/AGENTS.md
              </a>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 shrink-0">SKILL.md</span>
              <a
                href="https://raw.githubusercontent.com/arach/vif/main/.claude/skills/vif/SKILL.md"
                className="text-blue-400 hover:text-blue-300 break-all"
              >
                https://raw.githubusercontent.com/arach/vif/main/.claude/skills/vif/SKILL.md
              </a>
            </div>
          </div>
        </div>

        {/* Main Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* AGENTS.md Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <FileText className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-display text-xl font-medium text-slate-900 mb-1">AGENTS.md</h2>
                <p className="text-sm text-slate-500">Cross-agent compatible</p>
              </div>
            </div>
            <p className="text-slate-600 mb-4">
              Standard format recognized by 60,000+ open source projects. Works with any AI coding agent.
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Globe className="w-4 h-4 text-slate-400" />
                Claude Code, Cursor, Copilot, Gemini CLI
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Project overview</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Setup commands</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Architecture</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">DSL reference</span>
            </div>
            <Link
              href="https://github.com/arach/vif/blob/main/AGENTS.md"
              target="_blank"
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium text-sm"
            >
              View on GitHub <ExternalLink className="w-4 h-4" />
            </Link>
          </div>

          {/* Claude Skill Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Puzzle className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="font-display text-xl font-medium text-slate-900 mb-1">Claude Skill</h2>
                <p className="text-sm text-slate-500">Auto-discovered</p>
              </div>
            </div>
            <p className="text-slate-600 mb-4">
              Comprehensive integration guide for Claude Code. Auto-loads when you mention vif, VifTargets, or demo automation.
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Code className="w-4 h-4 text-slate-400" />
                .claude/skills/vif/SKILL.md
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">VifTargets SDK</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Swift code</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Coordinates</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Voice injection</span>
            </div>
            <Link
              href="https://github.com/arach/vif/blob/main/.claude/skills/vif/SKILL.md"
              target="_blank"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              View on GitHub <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* What's Included */}
        <div className="mb-12">
          <h2 className="font-display text-2xl font-light text-slate-900 mb-6 text-center">What Agents Learn</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Scene DSL", desc: "YAML format for demo sequences" },
              { title: "App Integration", desc: "HTTP API on port 7851" },
              { title: "Navigation", desc: "Programmatic section switching" },
              { title: "Click Targets", desc: "Screen coordinates for UI elements" },
              { title: "Voice Injection", desc: "BlackHole virtual audio routing" },
              { title: "SwiftUI Modifiers", desc: "Dynamic coordinate tracking" },
            ].map((item, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl">
                <h3 className="font-medium text-slate-900 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Test Integration */}
        <div className="p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50 rounded-2xl">
          <h3 className="font-medium text-slate-900 mb-3">Test Your Integration</h3>
          <p className="text-sm text-slate-600 mb-4">
            If your app implements VifTargets, verify it's working:
          </p>
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm">
            <div className="text-slate-400 mb-2"># Check exposed targets</div>
            <div className="text-emerald-400 mb-3">curl http://localhost:7851/vif/targets | jq</div>
            <div className="text-slate-400 mb-2"># Test navigation</div>
            <div className="text-emerald-400 mb-3">curl -X POST http://localhost:7851/vif/navigate \</div>
            <div className="text-emerald-400 pl-4">-d '&#123;"section": "settings"&#125;'</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-200 mt-12">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-slate-500 hover:text-slate-900 transition-colors text-sm">
            ← Back to vif.dev
          </Link>
          <Link
            href="https://github.com/arach/vif"
            target="_blank"
            className="text-slate-500 hover:text-slate-900 transition-colors text-sm"
          >
            GitHub
          </Link>
        </div>
      </footer>
    </main>
  )
}
