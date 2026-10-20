"""Optional local accessibility evidence; requires Playwright Python and a reviewed axe source file.
Usage: python scripts/audit-demo-v0.py --axe /path/to/axe.min.js --url http://127.0.0.1:3108
Does not test auth or write cookies/storage; no requests to a deployed environment.
"""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--axe',required=True);parser.add_argument('--url',default='http://127.0.0.1:3108');args=parser.parse_args()
out=Path('docs/implementation/demo-v0/evidence');results=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda e:errors.append({'text':e.text,'location':e.location}) if e.type=='error' else None)
 for theme in ['dark','light']:
  for route in ['/demo','/demo/empresas','/demo/clientes','/demo/empleados','/demo/planning']:
   page.goto(args.url+route,wait_until='networkidle')
   toggle=page.get_by_role('button',name='Activar modo claro' if theme=='light' else 'Activar modo oscuro',exact=True)
   if toggle.count():toggle.click()
   if route=='/demo':page.wait_for_selector('.demo-map-marker')
   page.evaluate(Path(args.axe).read_text())
   r=page.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length}}")
   results.append({'theme':theme,'route':route,**r})
 browser.close()
(out/'accessibility.json').write_text(json.dumps({'engine':'axe-core 4.11.0 + Chromium software WebGL','checks':results,'errors':errors},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'violations':[(r['theme'],r['route'],[(v['id'],len(v['nodes'])) for v in r['violations']]) for r in results],'errors':errors},ensure_ascii=False))
