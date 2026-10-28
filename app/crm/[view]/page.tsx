import { notFound } from 'next/navigation'
import { CrmWorkspace } from '../../../components/crm-workspace'
import '../../demo/demo.css'
import '../../demo/themes.css'
import './crm.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Empresas y contactos · CleanOps 360', robots: { index: false, follow: false } }
export default async function CrmPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params
  if (view !== 'empresas' && view !== 'clientes') notFound()
  return <CrmWorkspace key={view} clientsOnly={view === 'clientes'} />
}
