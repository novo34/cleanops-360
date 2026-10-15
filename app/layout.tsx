import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "System status · CleanOps 360",
  description: "Design prototype for CleanOps 360 Administration / System status.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
