import { DemoScenarioProvider } from '../../components/demo/workspace'

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoScenarioProvider>{children}</DemoScenarioProvider>
}
