import { connection } from "next/server"

export default async function HomePage() {
  // Nonce-based CSP requires dynamic rendering of framework bootstrap scripts.
  await connection()
  return (
    <main>
      <h1>CleanOps 360</h1>
      <p>Foundation bootstrap en desarrollo.</p>
    </main>
  )
}
