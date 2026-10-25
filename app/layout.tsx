import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "CleanOps 360",
  description: "Plataforma operativa para empresas de limpieza y facility services en Suiza.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
