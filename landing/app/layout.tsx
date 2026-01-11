import type React from "react"
import type { Metadata } from "next"
import { Inter, Silkscreen } from "next/font/google"
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

const silkscreen = Silkscreen({
  subsets: ["latin"],
  variable: "--font-silkscreen",
  weight: ["400"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Vif — Vivid Screen Capture for macOS",
  description: "Screenshots, video recording, and GIF creation for macOS. One CLI to capture it all.",
  keywords: "screenshot, video, capture, gif, macos, cli, npm, typescript, screen recording",
  authors: [{ name: "Vif" }],
  metadataBase: new URL("https://vif.arach.dev"),
  openGraph: {
    title: "Vif — Vivid Screen Capture for macOS",
    description: "Screenshots, video recording, and GIF creation for macOS. One CLI to capture it all.",
    type: "website",
    url: "https://vif.arach.dev",
    siteName: "Vif",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Vif - Vivid screen capture for macOS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vif — Vivid Screen Capture for macOS",
    description: "Screenshots, video recording, and GIF creation for macOS. One CLI to capture it all.",
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
    <html lang="en" className={`${inter.variable} ${sfProDisplay.variable} ${sfProText.variable} ${silkscreen.variable}`}>
      <body className="font-text antialiased">{children}</body>
    </html>
  )
}
