"""Safe browser checks + axe on synthetic demo; no authenticated paths."""
import json,os,subprocess,base64,hashlib
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[2];out=root/'design/evidence'
ca=os.environ.get('CODEX_PROXY_CERT')
args=[]
if ca:
 pub=subprocess.check_output(['openssl','x509','-in',ca,'-pubkey','-noout']);der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)
 args=['--ignore-certificate-errors-spki-list='+base64.b64encode(hashlib.sha256(der).digest()).decode()]
axe=(root/'design/.runtime/a11y/node_modules/axe-core/axe.min.js').read_text()
origin='https://cleanops.nuvurent.com'
r={'engine':'Chromium (preinstalled) + axe-core 4.11.0','checks':[],'accessibility':[],'blockedRequests':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=args,proxy={'server':os.environ['HTTPS_PROXY']})
 c=b.new_context(viewport={'width':1440,'height':1000},service_workers='block');page=c.new_page()
 def guard(route):
  u=route.request.url
  parts=urlsplit(u)
  if parts.scheme+'://'+parts.netloc==origin and (parts.path=='/demo' or parts.path.startswith(('/demo/','/_next/'))) and route.request.method in ['GET','HEAD']:route.continue_()
  else:r['blockedRequests'].append(u);route.abort()
 c.route('**/*',guard)
 page.goto(origin+'/demo/empresas',wait_until='networkidle')
 search=page.get_by_role('searchbox');search.fill('maison')
 expect(page.get_by_text('1 resultado',exact=True)).to_be_visible();r['checks'].append('Company search: 1 result')
 person=page.get_by_role('button',name='Maison des Rives',exact=False);person.focus();page.keyboard.press('Enter')
 expect(page.get_by_role('dialog')).to_be_visible();r['checks'].append('Company details open using Enter')
 page.screenshot(path=str(out/'company-dialog-desktop.png'),full_page=True)
 page.keyboard.press('Escape');expect(page.get_by_role('dialog')).not_to_be_visible();expect(person).to_be_focused();r['checks'].append('Escape closes dialog and returns focus')
 search.fill('no-existe');expect(page.get_by_role('heading',name='No hay coincidencias')).to_be_visible();r['checks'].append('Empty search state visible')
 page.screenshot(path=str(out/'empty-search-desktop.png'),full_page=True)
 page.get_by_role('button',name='Limpiar filtros',exact=True).click();expect(search).to_have_value('');r['checks'].append('Clear restores results')
 for width,height,label in [(1440,1000,'desktop'),(834,1112,'tablet'),(390,844,'mobile')]:
  page.set_viewport_size({'width':width,'height':height})
  for section in ['', '/empresas','/clientes','/empleados','/planning']:
   page.goto(origin+'/demo'+section,wait_until='networkidle')
   page.evaluate(axe)
   result=page.evaluate("async () => {let r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length}}")
   r['accessibility'].append({'route':'/demo'+section,'viewport':label,**result})
 page.goto(origin+'/demo',wait_until='networkidle');page.get_by_role('button',name='Abrir navegación',exact=True).click()
 expect(page.get_by_role('navigation',name='Navegación principal')).to_be_visible()
 page.keyboard.press('Escape')
 r['checks'].append({'mobileMenuEscapeCloses':page.get_by_role('button',name='Abrir navegación',exact=True).count()>0})
 page.screenshot(path=str(out/'mobile-navigation-after-escape.png'),full_page=True)
 r['storageCounts']=page.evaluate('({local:localStorage.length,session:sessionStorage.length})');r['cookieCount']=len(c.cookies())
 c.close();b.close()
(out/'interaction-a11y.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checks':r['checks'],'violations':[(x['route'],x['viewport'],[v['id'] for v in x['violations']]) for x in r['accessibility']],'cookieCount':r['cookieCount']}))
