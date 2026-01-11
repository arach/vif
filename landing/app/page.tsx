import HeroSection from "@/components/hero-section"
import FeaturesSection from "@/components/features-section"
import QuickStartSection from "@/components/quick-start-section"
import { Github } from "lucide-react"
import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <QuickStartSection />

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-silkscreen text-slate-900">Vif</span>
            <span className="text-slate-400 text-sm">— Vivid screen capture</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/arach/vif"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              <Github className="w-5 h-5" />
            </Link>
            <Link
              href="https://www.npmjs.com/package/@arach/vif"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 27.23 27.23">
                <rect width="27.23" height="27.23" rx="2"/>
                <polygon fill="#fff" points="5.8 21.75 13.66 21.75 13.67 9.98 17.59 9.98 17.58 21.76 21.51 21.76 21.52 6.06 5.82 6.04 5.8 21.75"/>
              </svg>
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
