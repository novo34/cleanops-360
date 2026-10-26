import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import OperationsMap from '../../../components/demo/operations-map'
import { DemoWorkspace } from '../../../components/demo/workspace'
import { moduleFromPath } from '../../../lib/demo/model'
import '../demo.css'
import '../themes.css'

export const metadata = { icons: { icon: '/demo-map/icon.svg' }, title: 'Demo operativa · CleanOps 360', description: 'Espacio público de demostración con datos ficticios aislados.' }
export default async function DemoPage({ params }: { params: Promise<{ section?: string[] }> }) {
  await connection()
  const module = moduleFromPath((await params).section)
  if (!module) notFound()
  return <DemoWorkspace key={module} module={module} mapComponent={module === 'dashboard' ? OperationsMap : null} />
}
