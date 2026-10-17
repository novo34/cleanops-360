import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { DemoWorkspace } from '../../../components/demo/workspace'
import { moduleFromPath } from '../../../lib/demo/model'
import '../demo.css'

export const metadata = { title: 'Demo operativa · CleanOps 360', description: 'Espacio público de demostración con datos ficticios aislados.' }
export default async function DemoPage({ params }: { params: Promise<{ section?: string[] }> }) {
  await connection()
  const module = moduleFromPath((await params).section)
  if (!module) notFound()
  return <DemoWorkspace key={module} module={module} />
}
