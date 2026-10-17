"""Run the real private TS/HTTP adapter inside the owned PG16 container via Unix socket."""
import json
from pathlib import Path
import shutil


def run(b):
    root=b.ROOT; destination='/opt/b1-pg05'
    def require(result):
        if result.returncode:
            b.REPORT['httpTransportDiagnostic']={'stage':'copy-runtime-dependencies','reason':'NO_SPACE' if 'no space left' in result.stderr.lower() else 'COPY_OR_PROCESS_FAILURE','exitCode':result.returncode}
            raise RuntimeError('PG05_TEST_TRANSPORT_FAILED')
    require(b.docker('exec',b.CID,'mkdir','-p',destination+'/scripts',destination+'/node_modules'))
    require(b.docker('cp','-L',shutil.which('node'),b.CID+':'+destination+'/node'))
    for name in ['lib','package.json','scripts/pg05-http-real.ts']:
        target=destination+'/'+name
        require(b.docker('cp',str(root/name),b.CID+':'+target))
    lock=json.loads((root/'package-lock.json').read_text())['packages']
    names={'pg','argon2','otpauth'}; selected=set();pending=list(names)
    while pending:
        name=pending.pop();path='node_modules/'+name
        if path in selected:continue
        package=lock.get(path)
        if package is None:raise RuntimeError('PG05_LOCK_DEPENDENCY_MISSING')
        selected.add(path)
        pending.extend(package.get('dependencies',{}))
    for package in sorted(selected):
        source=root/package
        if not source.is_dir():raise RuntimeError('PG05_DEPENDENCY_NOT_INSTALLED')
        target=destination+'/'+package
        require(b.docker('exec',b.CID,'mkdir','-p',str(Path(target).parent)))
        require(b.docker('cp',str(source),b.CID+':'+target))
    result=b.docker('exec','-i',b.CID,destination+'/node','--experimental-strip-types',destination+'/scripts/pg05-http-real.ts',data=json.dumps({'tenant':b.A,'user':b.V,'principal':b.Q,'identityRole':b.ROLE['identity']}),timeout=90)
    try:
        # Script emits only redacted check names/statuses, never dependency errors,
        # factors, cookies, key bytes, raw HTTP responses or connection information.
        report=json.loads(result.stdout)
        b.REPORT['httpPostgresIntegration']=report
        for check in report['checks']:b.record(check['name'],check['status'],check.get('detail'))
        if result.returncode and all(c['status']=='PASS' for c in report['checks']):
            b.record('HTTP-real-PG-process','FAIL','Child returned failure without a check failure')
    except Exception:
        b.record('HTTP-real-PG-process','FAIL','Redacted transport/ABI/dependency failure; no HTTP success claimed')
    # Full data snapshot AFTER the real HTTP effects, without assuming test keys
    # constitute operational recovery/custody. Global roles are the same owned cluster.
    fingerprint="SELECT md5(string_agg(id::text||state,',' ORDER BY id)) FROM app.sessions;"
    before=b.sql(fingerprint)
    dump=b.docker('exec',b.CID,'pg_dump','-U','postgres','-d','core','-Fc','-f','/tmp/pg05-after-http.dump')
    b.check('HTTP-PG-create-owned-restore-db','CREATE DATABASE restored_after_http;')
    restore=b.docker('exec',b.CID,'pg_restore','-U','postgres','--exit-on-error','-d','restored_after_http','/tmp/pg05-after-http.dump')
    b.record('HTTP-PG-backup-restore-post-effects','PASS' if not dump.returncode and not restore.returncode else 'FAIL')
    restored=b.sql(fingerprint,database='restored_after_http')
    b.record('HTTP-PG-all-21-tables-restored-identically','PASS' if not before.returncode and not restored.returncode and restored.stdout.strip()==before.stdout.strip() else 'FAIL')
