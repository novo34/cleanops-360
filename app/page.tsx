import { connection } from "next/server"
import AdminSystemStatus from "../components/admin-system-status"

export default async function HomePage() {
  // Per-request CSP nonces must also reach the framework bootstrap scripts.
  await connection()
  return <AdminSystemStatus />
}
