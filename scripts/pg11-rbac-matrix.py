"""Canonical POL decision cells, actual service session; synthetic grants are not productive policy."""
import re
import uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(b):
 actions=['view','create','edit','approve','delete','export','manage_permissions']
 rows=[]
 for line in (ROOT/'docs/RBAC_PERMISSIONS.md').read_text().splitlines():
  if line.startswith('| `'):
   columns=[c.strip() for c in line.strip('|').split('|')]
   if len(columns)==8:rows.append((columns[0].strip('`'),[actions[i] for i,c in enumerate(columns[1:]) if c=='POL']))
 if len(rows)!=23:raise RuntimeError('CANONICAL_RBAC_MATRIX_CHANGED')
 roles=['Super Admin','Company Admin','Sales','Planner','Project Manager','Site Responsible','Visitor','Employee','Finance','Viewer']
 q=lambda s:"'"+str(s).replace("'","''")+"'"
 resources={kind:tuple(str(uuid.uuid4()) for _ in range(3)) for kind,_ in rows}
 setup=[]
 for kind,_ in rows:
  own,peer,foreign=resources[kind]
  setup.append(f"INSERT INTO app.access_resources VALUES('{b.A}','{own}',{q(kind)},NULL),('{b.A}','{peer}',{q(kind)},NULL),('{b.B}','{foreign}',{q(kind)},NULL);")
 b.check('SQL11-canonical-matrix-synthetic-resource-fixtures',''.join(setup))
 cells=[(action,kind,*resources[kind]) for kind,valid in rows for action in valid]
 values=','.join('('+','.join(q(x) for x in cell)+')' for cell in cells)
 def check(name,expected,which='own'):
  b.check(name,"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));SELECT bool_and(auth_api.effective_access(action,kind,"+which+"::uuid) IS "+('TRUE' if expected else 'FALSE')+") FROM (VALUES "+values+") AS cell(action,kind,own,peer,foreign_id);COMMIT;",'t',b.ROLE['identity'])
 for index,label in enumerate(roles):
  role=str(uuid.uuid4());grant_ids=[];deny_ids=[];tag='SQL11-matrix-'+str(index+1)
  b.check(tag+'-synthetic-role-membership',f"INSERT INTO app.access_roles VALUES('{b.A}','{role}',{q(label)},NULL);INSERT INTO app.access_role_memberships VALUES('{b.A}','{role}','{b.V}',clock_timestamp()-interval '1m',NULL,NULL);")
  check(tag+'-role-label-has-no-authority',False)
  grants=[]
  for action,kind,own,_,_ in cells:
   gid=str(uuid.uuid4());grant_ids.append(gid)
   grants.append(f"INSERT INTO app.access_rules VALUES('{b.A}','{gid}','{role}',NULL,{q(action)},{q(kind)},'{own}','ALLOW',clock_timestamp()-interval '2m',NULL,NULL);")
  b.check(tag+'-synthetic-explicit-scoped-grants',''.join(grants))
  check(tag+'-explicit-grants-allowed',True)
  check(tag+'-same-tenant-outside-scope-denied',False,'peer')
  check(tag+'-foreign-tenant-denied',False,'foreign_id')
  denies=[]
  for action,kind,own,_,_ in cells:
   did=str(uuid.uuid4());deny_ids.append(did)
   denies.append(f"INSERT INTO app.access_rules VALUES('{b.A}','{did}',NULL,'{b.V}',{q(action)},{q(kind)},'{own}','DENY',clock_timestamp()-interval '1m',NULL,NULL);")
  b.check(tag+'-synthetic-individual-denies',''.join(denies))
  check(tag+'-individual-explicit-deny-beats-role',False)
  ids=','.join(q(x) for x in deny_ids)
  b.check(tag+'-synthetic-expire-grants',f"UPDATE app.access_rules SET revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND id IN({ids});UPDATE app.access_rules SET expires_at=clock_timestamp()-interval '1m' WHERE tenant_id='{b.A}' AND role_id='{role}';")
  check(tag+'-expired-grants-denied',False)
  b.check(tag+'-synthetic-revoke-membership',f"UPDATE app.access_rules SET expires_at=NULL WHERE tenant_id='{b.A}' AND role_id='{role}';UPDATE app.access_role_memberships SET revoked_at=clock_timestamp() WHERE tenant_id='{b.A}' AND role_id='{role}' AND user_id='{b.V}';")
  check(tag+'-revoked-membership-denied-in-existing-session',False)
 b.REPORT['rbacDecisionMatrix']={'canonical':'docs/RBAC_PERMISSIONS.md','roles':len(roles),'resources':len(rows),'validActionResourceCells':len(cells),'statesPerCell':7,'evaluations':len(roles)*len(cells)*7,'scope':'Real effective_access in non-superuser identity service with existing ACTIVE target session. All explicit grants are synthetic; no productive defaults or permission policy inferred from role labels.'}
 # Approved recursive scopes: moving a document must invalidate the former scope.
 root,project,document,other,cross=[str(uuid.uuid4()) for _ in range(5)]
 b.check('SQL11-hierarchy-synthetic-authoritative-graph',f"INSERT INTO app.access_resources VALUES('{b.A}','{root}','work_engagements',NULL),('{b.A}','{project}','projects','{root}'),('{b.A}','{document}','documents','{project}'),('{b.A}','{other}','projects',NULL),('{b.B}','{cross}','projects',NULL);INSERT INTO app.access_rules VALUES('{b.A}','{uuid.uuid4()}',NULL,'{b.V}','view','projects','{project}','ALLOW',clock_timestamp()-interval '1m',NULL,NULL);")
 def document_check(name,wanted):
  b.check(name,f"BEGIN;SELECT auth_api.begin_verified_context(repeat('c',43));SELECT auth_api.effective_access('view','documents','{document}');COMMIT;",wanted,b.ROLE['identity'])
 document_check('SQL11-hierarchy-project-grant-applies-to-document','t')
 b.check('SQL11-hierarchy-synthetic-resource-move',f"UPDATE app.access_resources SET parent_id='{other}' WHERE tenant_id='{b.A}' AND id='{document}';")
 document_check('SQL11-hierarchy-move-removes-prior-authority','f')
 b.check('SQL11-hierarchy-cross-tenant-parent-rejected',f"UPDATE app.access_resources SET parent_id='{cross}' WHERE tenant_id='{b.A}' AND id='{document}';",failure='23503')
 b.check('SQL11-hierarchy-synthetic-cycle',f"UPDATE app.access_resources SET parent_id='{document}' WHERE tenant_id='{b.A}' AND id='{other}';")
 document_check('SQL11-hierarchy-cycle-fails-closed','f')
