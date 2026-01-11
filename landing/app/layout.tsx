import type React from "react"
import type { Metadata } from "next"
import { Inter, Fraunces } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const sfProDisplay = Inter({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
})

const sfProText = Inter({
  subsets: ["latin"],
  variable: "--font-text",
  weight: ["300", "400", "500", "600"],
  display: "swap",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Vif — Declarative Screen Capture",
  description: "Agentic asset generation. CLI-native screen capture built for AI agents. Everything is a file.",
  keywords: "ai agents, llm, screen capture, declarative, storyboard, yaml, cli, macos, typescript, agentic, asset generation",
  authors: [{ name: "Vif" }],
  metadataBase: new URL("https://vif.arach.dev"),
  openGraph: {
    title: "Vif — Declarative Screen Capture",
    description: "Agentic asset generation. CLI-native screen capture built for AI agents. Everything is a file.",
    type: "website",
    url: "https://vif.arach.dev",
    siteName: "Vif",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Vif - Declarative Screen Capture for macOS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vif — Declarative Screen Capture",
    description: "Agentic asset generation. CLI-native screen capture built for AI agents. Everything is a file.",
    images: ["/og-image.png"],
  },
  generator: 'Vif'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sfProDisplay.variable} ${sfProText.variable} ${fraunces.variable}`}>
      <body className="font-text antialiased">{children}</body>
    </html>
  )
}
