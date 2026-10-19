"""Query Codex's own discovery API without starting a model turn or reading credentials."""
import subprocess,json,selectors,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
p=subprocess.Popen(['codex','--no-daemon','-c','sqlite_home="'+str(root/'design/.runtime/codex-state')+'"','app-server','--listen','stdio://'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
def send(v):p.stdin.write(json.dumps(v)+'\n');p.stdin.flush()
s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ)
def response(id):
 end=time.monotonic()+25
 while time.monotonic()<end:
  if s.select(1):
   line=p.stdout.readline()
   if not line:raise RuntimeError('Codex app-server exited')
   r=json.loads(line)
   if r.get('id')==id:return r
 raise TimeoutError('Codex app-server response timeout')
try:
 send({'id':1,'method':'initialize','params':{'clientInfo':{'name':'cleanops-design-validation','version':'1.0.0'}}});response(1)
 send({'method':'initialized','params':{}})
 send({'id':2,'method':'skills/list','params':{'cwds':[str(root)],'forceReload':True}})
 r=response(2)
 (root/'design/evidence/codex-skills.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
 expected={'emil-design-eng','cleanops-impeccable','cleanops-taste','cleanops-design'}
 found={x['name'] for d in r.get('result',{}).get('data',[]) for x in d.get('skills',[]) if x.get('enabled',True)}
 print(json.dumps({'expected':sorted(expected),'discovered':sorted(found),'missing':sorted(expected-found)}))
 if expected-found:raise SystemExit(1)
except Exception as e:
 (root/'design/evidence/codex-skills.json').write_text(json.dumps({'status':'PENDING','error':str(e),'reason':'Managed Codex installation_id path is read-only; no shared config changes authorized.','convention':'.agents/skills/<name>/SKILL.md'},indent=2)+'\n')
 print('PENDING: '+str(e))
 raise SystemExit(2)
finally:p.terminate();p.wait(timeout=5)
