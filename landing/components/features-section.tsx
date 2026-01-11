"use client"

import { Badge } from "@/components/ui/badge"
import {
  Bot,
  FileCode,
  GitBranch,
  Music,
  Film,
  Terminal,
  Layers,
  Wand2
} from "lucide-react"

export default function FeaturesSection() {
  const features = [
    {
      icon: FileCode,
      title: "Declarative Storyboards",
      description: "Define video compositions in YAML. Sequences, transitions, audio tracks—all version-controlled and agent-editable.",
      demo: ["storyboard.yaml"],
      isKeyboard: false,
    },
    {
      icon: GitBranch,
      title: "Take Management",
      description: "Built-in versioning for assets. Create takes, list history, revert to any version. Your agent can iterate freely.",
      demo: ["vif take"],
      isKeyboard: false,
    },
    {
      icon: Music,
      title: "Audio Sync & Mixing",
      description: "Analyze BPM, detect beats, mix audio with fade controls. Sync your cuts to the music automatically.",
      demo: ["vif mix"],
      isKeyboard: false,
    },
    {
      icon: Terminal,
      title: "CLI-Native",
      description: "Every operation is a command. No GUI, no clicks. Perfect for agent tool-use and automation pipelines.",
      demo: ["vif render"],
      isKeyboard: false,
    },
    {
      icon: Film,
      title: "Full Capture Suite",
      description: "Screenshots, video recording, GIF creation, web optimization. All the primitives your agent needs.",
      demo: ["vif shot"],
      isKeyboard: false,
    },
    {
      icon: Wand2,
      title: "Conversation-Driven",
      description: "Iterate through conversation. Agent edits YAML, runs render, reviews output, refines. Natural workflow.",
      demo: ["Agentic"],
      isKeyboard: true,
    },
  ]

  return (
    <section id="features" className="py-12 px-4 bg-gradient-to-b from-white to-slate-50/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 border-slate-200 text-slate-600 bg-white/50 rounded-xl hidden sm:inline-block">
            Built for Agents
          </Badge>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-extralight mb-3 text-slate-900">
            Everything<span className="font-light bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent"> is a File</span>
          </h2>
          <p className="font-text text-base text-slate-600 max-w-2xl mx-auto font-light">
            Storyboards, configs, takes—all stored as files. Let your AI agent iterate on video production through natural conversation.
          </p>
        </div>

        <div className="relative">
          {/* Background decorative elements */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(34,197,94,0.03),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_75%,rgba(59,130,246,0.03),transparent_50%)]" />

          {/* Interactive feature showcase */}
          <div className="relative grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-3 sm:p-6 lg:p-8 shadow-lg hover:shadow-xl transition-all duration-150 hover:scale-[1.002] overflow-hidden block"
              >
                {/* Animated background on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-blue-50/0 group-hover:from-emerald-50/50 group-hover:to-blue-50/30 transition-all duration-300 rounded-2xl sm:rounded-3xl" />

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-3 sm:mb-6">
                    <div className="p-2 sm:p-3 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl sm:rounded-2xl group-hover:from-emerald-100 group-hover:to-blue-100 transition-all duration-300">
                      <feature.icon className="w-4 h-4 sm:w-6 sm:h-6 text-slate-600 group-hover:text-emerald-600 transition-colors duration-300" />
                    </div>
                    <div className="flex items-center space-x-1">
                      {feature.isKeyboard ? (
                        feature.demo.map((key, keyIndex) => (
                          <span
                            key={keyIndex}
                            className="inline-flex items-center justify-center min-w-[1.25rem] sm:min-w-[1.5rem] h-5 sm:h-6 px-1 sm:px-2 bg-slate-900 text-white border border-slate-700 rounded-md sm:rounded-lg shadow-sm font-mono text-[10px] sm:text-xs font-medium group-hover:bg-emerald-600 group-hover:border-emerald-500 transition-all duration-300"
                          >
                            {key}
                          </span>
                        ))
                      ) : (
                        <div className="px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-900 text-white rounded-full text-[10px] sm:text-xs font-medium font-mono group-hover:bg-gradient-to-r group-hover:from-emerald-600 group-hover:to-blue-600 transition-all duration-300">
                          {feature.demo[0]}
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-display text-sm sm:text-xl font-medium text-slate-900 mb-1 sm:mb-3 group-hover:text-slate-800 transition-colors duration-300">
                    {feature.title}
                  </h3>
                  <p className="font-text text-xs sm:text-sm text-slate-600 leading-tight sm:leading-relaxed group-hover:text-slate-700 transition-colors duration-300">
                    {feature.description}
                  </p>
                </div>

                {/* Subtle glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/0 to-blue-500/0 group-hover:from-emerald-500/20 group-hover:to-blue-500/20 rounded-2xl sm:rounded-3xl blur-sm opacity-0 group-hover:opacity-100 transition-all duration-500 -z-10" />
              </div>
            ))}
          </div>
        </div>

        {/* Agent workflow callout */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50 rounded-2xl">
            <Bot className="w-5 h-5 text-emerald-600" />
            <p className="text-sm text-slate-700">
              <span className="font-medium">Agent workflow:</span>{" "}
              <span className="text-slate-500">Edit YAML → Run vif render → Review → Iterate</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
