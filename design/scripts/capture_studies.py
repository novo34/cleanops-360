from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for name in ['a-ledger','b-atelier','c-dispatch']:
  for width,height,label in [(1440,1000,'desktop'),(834,1112,'tablet'),(390,844,'mobile')]:
   page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   page.set_content((root/'studies'/f'{name}.html').read_text())
   page.screenshot(path=str(root/'studies'/f'{name}-{label}.png'),full_page=True)
   results.append({'study':name,'viewport':label,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'headingCount':page.locator('h1').count()})
   page.close()
 b.close()
(root/'evidence/study-validation.json').write_text(json.dumps(results,indent=2)+'\n')
print(results)
assert all(not r['overflow'] and r['headingCount']==1 for r in results)
