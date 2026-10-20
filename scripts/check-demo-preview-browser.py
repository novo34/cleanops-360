"""Local-only gateway/browser smoke; generates and deletes an ephemeral synthetic access secret."""
import argparse, base64, json, os, secrets, subprocess, tempfile
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3109')
parser.add_argument('--password-file')
args = parser.parse_args()
out = Path('docs/implementation/demo-v0/closure-evidence')
with tempfile.TemporaryDirectory(prefix='cleanops-preview-') as directory:
    secret = Path(args.password_file).read_text().strip() if args.password_file else secrets.token_hex(32)
    path = Path(directory) / 'password'
    path.write_text(secret); path.chmod(0o600)
    env = {**os.environ, 'PREVIEW_PASSWORD_FILE': str(path), 'PREVIEW_UPSTREAM': 'http://127.0.0.1:3107', 'PORT': '3109'}
    gateway = None if args.password_file else subprocess.Popen(['node', 'deploy/demo-preview/gateway.mjs'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            context = browser.new_context(http_credentials={'username':'owner','password':secret}, color_scheme='dark')
            page = context.new_page(); errors=[]; resources=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: resources.append({'status':response.status,'path':response.url.removeprefix(args.url)}) if response.status >= 400 else None)
            response = page.goto(args.url + '/demo', wait_until='networkidle')
            assert response.status == 200
            page.wait_for_selector('.demo-map-marker')
            assert page.locator('.demo-map-marker').count() == 3
            page.screenshot(path=str(out/'isolated-preview-local.png'), full_page=True)
            page.get_by_role('button', name='Activar modo claro').click()
            page.reload(wait_until='networkidle')
            assert page.locator('.demo-workspace').get_attribute('data-theme') == 'light'
            page.get_by_role('navigation').get_by_role('link', name='Empresas', exact=True).click()
            page.get_by_role('heading', name='Directorio de empresas').wait_for()
            assert context.cookies() == []
            assert not errors, errors
            assert not resources, resources
            result={'authenticated_demo':200,'markers':3,'theme_reload':'light','client_navigation':'empresas','cookies':0,'page_errors':errors,'failed_resources':resources,'online':False}
            browser.close()
        try:
            urlopen(args.url + '/demo')
            raise AssertionError('Anonymous preview must be denied')
        except HTTPError as error:
            assert error.code == 401
            result['anonymous_status']=error.code
        from urllib.request import Request
        headers = {'Authorization':'Basic '+base64.b64encode(('owner:'+secret).encode()).decode()}
        for path,method,expected in [('/login','GET',404),('/api/example','GET',404),('/demo','POST',405)]:
            try:
                urlopen(Request(args.url+path,headers=headers,method=method))
                raise AssertionError('Restricted request accepted')
            except HTTPError as error:
                assert error.code == expected
                result[method+' '+path] = error.code
        (out/('compose-runtime.json' if args.password_file else 'preview-browser.json')).write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result))
    finally:
        if gateway:
            gateway.terminate(); gateway.wait(timeout=10)
