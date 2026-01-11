"use client"

import Image from "next/image"
import Link from "next/link"
import { ExternalLink, Play } from "lucide-react"

interface Example {
  name: string
  description: string
  url: string
  screenshot: string
  tags: string[]
}

const examples: Example[] = [
  {
    name: "Speakeasy",
    description: "Text-to-speech library landing page. Screenshots and demo video generated with Vif for the hero section.",
    url: "https://speakeasy.arach.dev",
    screenshot: "/example-speakeasy.png",
    tags: ["Landing Page", "Demo Video", "Screenshots"],
  },
]

export default function ExamplesSection() {
  return (
    <section className="py-16 px-4 bg-slate-50/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-fraunces text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Built with Vif
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Real projects using Vif for asset generation. Declarative configs, automated captures, production-ready output.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {examples.map((example) => (
            <div
              key={example.name}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="relative aspect-video bg-slate-100 overflow-hidden">
                <Image
                  src={example.screenshot}
                  alt={`${example.name} screenshot`}
                  fill
                  className="object-cover object-top"
                />
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-fraunces text-xl font-semibold text-slate-900">
                    {example.name}
                  </h3>
                  <Link
                    href={example.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Visit
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <p className="text-slate-600 text-sm mb-3">
                  {example.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {example.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Dogfooding card - Vif asset viewer */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="relative aspect-video bg-slate-100 overflow-hidden">
              <Image
                src="/asset-viewer.png"
                alt="Vif Asset Viewer"
                fill
                className="object-cover object-top"
              />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-fraunces text-xl font-semibold text-slate-900">
                  Vif Asset Viewer
                </h3>
                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                  Dogfooding
                </span>
              </div>
              <p className="text-slate-600 text-sm mb-3">
                Auto-generated HTML gallery for reviewing captured assets. This screenshot was captured using Vif itself.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                  Gallery
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                  Self-hosted
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                  Auto-generated
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
