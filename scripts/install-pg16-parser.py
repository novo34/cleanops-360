#!/usr/bin/env python3
"""Build the same pglast6.16/PG16 from immutable upstream source when its index entry is unavailable.
No Git commands, application configuration, database connection or SQL execution.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

PGLAST='a238e28b0d655f0b57c40215585e0d0f39574442' # upstream v6.16
LIBPG_QUERY='fce106abf41205e5d0db47bea7de44ad1e36f7a5' # exact submodule in that commit

def main():
 evidence=[]
 with tempfile.TemporaryDirectory(prefix='b1-pg16-parser-') as temporary:
  root=Path(temporary)
  for repository,revision in [('lelit/pglast',PGLAST),('pganalyze/libpg_query',LIBPG_QUERY)]:
   name=repository.split('/')[1];archive=root/(name+'.tar.gz')
   url='https://codeload.github.com/'+repository+'/tar.gz/'+revision
   with urllib.request.urlopen(url,timeout=45) as response:
    data=response.read(64*1024*1024+1)
   if len(data)>64*1024*1024:raise RuntimeError('PARSER_ARCHIVE_TOO_LARGE')
   archive.write_bytes(data)
   with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
   evidence.append({'repository':repository,'revision':revision,'archiveSha256':hashlib.sha256(data).hexdigest()})
  source=root/('pglast-'+PGLAST);library=root/('libpg_query-'+LIBPG_QUERY)
  if (source/'version.txt').read_text().strip()!='6.16':raise RuntimeError('PARSER_SOURCE_VERSION_MISMATCH')
  # Only the owned temporary extraction is touched. Never initialize/update a Git submodule.
  if (source/'libpg_query').exists():shutil.rmtree(source/'libpg_query')
  library.rename(source/'libpg_query')
  subprocess.run([sys.executable,'-m','pip','install','setuptools','wheel'],check=True,timeout=120)
  subprocess.run([sys.executable,'-m','pip','install','--no-index','--no-deps','--no-build-isolation',str(source)],check=True,timeout=240)
  from pglast import get_postgresql_version
  if importlib.metadata.version('pglast')!='6.16' or get_postgresql_version()[0]!=16:raise RuntimeError('POSTGRESQL16_PARSER_REQUIRED')
  print(json.dumps({'parser':'pglast6.16','postgresqlVersion':get_postgresql_version(),'immutableSources':evidence,'temporarySourceCleanup':'ON_CONTEXT_EXIT','sqlExecuted':False}))
 if Path(temporary).exists():raise RuntimeError('PARSER_SOURCE_CLEANUP_FAILED')
 print('PG16 parser source build and cleanup PASS; no SQL executed')

if __name__=='__main__':main()
