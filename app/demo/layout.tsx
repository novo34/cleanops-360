import { headers } from 'next/headers'
import { DemoScenarioProvider } from '../../components/demo/workspace'

// Runs before demo content is parsed; the existing request nonce preserves CSP.
const bootstrap = `(function(){var t;try{t=localStorage.getItem('cleanops.demo.theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.getElementById('demo-theme-root').setAttribute('data-demo-theme',t)})()`
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return <div id="demo-theme-root" suppressHydrationWarning><script nonce={nonce} dangerouslySetInnerHTML={{ __html: bootstrap }} /><DemoScenarioProvider>{children}</DemoScenarioProvider></div>
}
