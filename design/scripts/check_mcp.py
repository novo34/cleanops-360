"""Real MCP handshake + tools/list + browser navigation; no LLM or remote MCP port."""
import subprocess,json,selectors,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
p=subprocess.Popen(['python3','design/scripts/run_mcp.py'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ)
results=[]
def request(id,method,params):
 p.stdin.write(json.dumps({'jsonrpc':'2.0','id':id,'method':method,'params':params})+'\n');p.stdin.flush()
 end=time.monotonic()+55
 while time.monotonic()<end:
  if s.select(1):
   line=p.stdout.readline()
   if not line:raise RuntimeError('MCP exited')
   r=json.loads(line)
   if r.get('id')==id:
    results.append(r)
    if 'error' in r or r.get('result',{}).get('isError'):raise RuntimeError(str(r)[:500])
    return r
 raise TimeoutError(method)
try:
 request(1,'initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'cleanops-design-check','version':'1.0'}})
 p.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');p.stdin.flush()
 r=request(2,'tools/list',{});print('MCP tools:',len(r['result']['tools']))
 request(3,'tools/call',{'name':'browser_navigate','arguments':{'url':'https://cleanops.nuvurent.com/demo'}})
 request(4,'tools/call',{'name':'browser_snapshot','arguments':{}})
 request(5,'tools/call',{'name':'browser_console_messages','arguments':{'level':'error'}})
 request(6,'tools/call',{'name':'browser_close','arguments':{}})
 print('MCP initialize, tools/list, browser_navigate, snapshot, console, close completed')
finally:
 (root/'design/evidence/mcp-smoke.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 p.terminate();p.wait(timeout=5)
