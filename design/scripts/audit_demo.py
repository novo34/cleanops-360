"""Read-only synthetic demo evidence. Uses preinstalled Python Playwright, not Playwright Test."""
import json, os, subprocess,base64,hashlib
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'; OUT.mkdir(exist_ok=True)
origin='https://cleanops.nuvurent.com'
ca=Path(os.environ['CODEX_PROXY_CERT'])
pub=subprocess.check_output(['openssl','x509','-in',str(ca),'-pubkey','-noout'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)
pin=base64.b64encode(hashlib.sha256(der).digest()).decode()
report={'target':origin+'/demo','viewports':[], 'scope':'Synthetic demo only; no login or private APIs'}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--ignore-certificate-errors-spki-list='+pin],proxy={'server':os.environ['HTTPS_PROXY']})
    for width,height,label in [(1440,1000,'desktop'),(834,1112,'tablet'),(390,844,'mobile')]:
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1, reduced_motion='reduce',service_workers='block')
        def guard(route):
            u=urlsplit(route.request.url)
            safe=u.scheme+'://'+u.netloc==origin and (u.path=='/demo' or u.path.startswith(('/demo/','/_next/'))) and route.request.method in ['GET','HEAD']
            route.continue_() if safe else route.abort()
        context.route('**/*',guard)
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        for section in ['', '/empresas','/clientes','/empleados','/planning']:
            response=page.goto(origin+'/demo'+section,wait_until='networkidle',timeout=45000)
            page.screenshot(path=str(OUT/f'before-{section.strip("/") or "dashboard"}-{label}.png'),full_page=True)
            measurements=page.evaluate('''() => ({title:document.querySelector('h1')?.textContent, overflow:document.documentElement.scrollWidth>innerWidth, smallText:[...document.querySelectorAll('main *')].filter(e=>e.textContent.trim() && e.children.length===0 && parseFloat(getComputedStyle(e).fontSize)<12).map(e=>({text:e.textContent.trim().slice(0,80),size:getComputedStyle(e).fontSize})).slice(0,20), smallTargets:[...document.querySelectorAll('button,a,select,input')].filter(e=>{let r=e.getBoundingClientRect();return r.width && r.height && (r.width<24||r.height<24)}).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,60),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)})).slice(0,20)})''')
            report['viewports'].append({'viewport':label,'width':width,'route':'/demo'+section,'status':response.status,'measurements':measurements,'pageErrors':errors.copy(),'cookiesCount':len(context.cookies())})
        context.close()
    browser.close()
(OUT/'demo-measurements.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'screenshots':len(report['viewports']),'statuses':[r['status'] for r in report['viewports']],'overflows':[r['route']+' '+r['viewport'] for r in report['viewports'] if r['measurements']['overflow']]}))
