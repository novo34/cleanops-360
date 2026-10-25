'use client'

import { useSyncExternalStore } from 'react'
export type DemoTheme = 'light' | 'dark'
export const themeKey = 'cleanops.demo.theme'
let volatilePreference: DemoTheme | undefined
function preference(): DemoTheme | undefined {
  try { const value = localStorage.getItem(themeKey); return value === 'light' || value === 'dark' ? value : volatilePreference } catch { return volatilePreference }
}
function snapshot(): DemoTheme { return preference() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') }
function synchronize() { document.getElementById('demo-theme-root')?.setAttribute('data-demo-theme', snapshot()) }
function subscribe(listener: () => void) {
  const media = matchMedia('(prefers-color-scheme: light)')
  const changed = () => { synchronize(); listener() }
  media.addEventListener('change', changed); window.addEventListener('storage', changed); window.addEventListener('demo-theme-change', changed)
  synchronize()
  return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', changed); window.removeEventListener('demo-theme-change', changed) }
}
export function useDemoTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'dark' as const)
  const setTheme = (value: DemoTheme) => {
    volatilePreference = value
    try { localStorage.setItem(themeKey, value) } catch { /* A blocked store must not disable the visual control. */ }
    window.dispatchEvent(new Event('demo-theme-change'))
  }
  return { theme, setTheme }
}
