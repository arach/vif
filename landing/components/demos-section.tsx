"use client"

interface Demo {
  title: string
  description: string
  video: string
}

const demos: Demo[] = [
  {
    title: "Cursor Overlay",
    description: "Animated cursor with click visualization",
    video: "/demos/demo-cursor.mp4",
  },
  {
    title: "Terminal Workflow",
    description: "iTerm + Vim with live typing",
    video: "/demos/demo-iterm-vim.mp4",
  },
]

export default function DemosSection() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-fraunces text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Live Demos
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Recorded automatically with Vif. Tight framing, smooth cursor, highlighted typing.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {demos.map((demo) => (
            <div
              key={demo.title}
              className="bg-slate-900 rounded-xl overflow-hidden shadow-lg"
            >
              <div className="relative aspect-video">
                <video
                  src={demo.video}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              </div>
              <div className="p-4">
                <h3 className="font-fraunces text-lg font-semibold text-white mb-1">
                  {demo.title}
                </h3>
                <p className="text-slate-400 text-sm">
                  {demo.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
