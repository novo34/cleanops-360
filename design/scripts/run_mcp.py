"""Project-scoped stdio MCP launcher. No global configuration, browser storage or public port."""
import os,json,subprocess,hashlib,base64,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2]
runtime=root/'design/.runtime';runtime.mkdir(exist_ok=True)
cli=runtime/'mcp/node_modules/@playwright/mcp/cli.js'
if not cli.is_file():raise SystemExit('Run the documented locked npm ci into design/.runtime/mcp first')
launch={'headless':True,'executablePath':shutil.which('chromium') or '/usr/bin/chromium'}
proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
if proxy:launch['proxy']={'server':proxy}
# Explicit trust for the configured environment proxy CA only. No blanket ignoreHTTPSErrors.
ca=os.environ.get('CODEX_PROXY_CERT')
if ca and Path(ca).is_file():
 pub=subprocess.check_output(['openssl','x509','-in',ca,'-pubkey','-noout'])
 der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)
 pin=base64.b64encode(hashlib.sha256(der).digest()).decode()
 launch['args']=['--ignore-certificate-errors-spki-list='+pin]
config={'browser':{'browserName':'chromium','isolated':True,'launchOptions':launch,'contextOptions':{'viewport':{'width':1440,'height':1000},'serviceWorkers':'block'},'initPage':[str(root/'design/scripts/demo-boundary.mjs')]},'outputDir':str(runtime/'mcp-output')}
p=runtime/'mcp-config.json';p.write_text(json.dumps(config))
env={k:v for k,v in os.environ.items() if k in {'PATH','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','TMPDIR','LANG','LC_ALL'}}
env['XDG_CACHE_HOME']=str(runtime/'cache')
env['PLAYWRIGHT_BROWSERS_PATH']=str(runtime/'browsers')
os.chdir(root)
os.execve(shutil.which('node'),['node',str(cli),'--config',str(p),'--isolated','--headless','--block-service-workers','--allowed-origins','https://cleanops.nuvurent.com','--codegen','none','--console-level','error'],env)
