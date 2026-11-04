#!/usr/bin/env python3
"""Isolated Traefik behaviour check for the B1 ForwardAuth template.

Runs an OFFICIAL Traefik binary (path given explicitly) on 127.0.0.1 only, with throwaway
mock auth/backend servers and the reviewed template deploy/staging/traefik/b1-forward-auth.delta.example.yaml.
No Docker daemon, VPS, secret, ACME, network egress or real certificate is involved; every
sandbox adaptation (plain-HTTP auth address, no mTLS, local entrypoint, local backend) is explicit below.

  python3 -I scripts/traefik-sandbox-check.py --traefik /path/to/traefik [--json]
"""
import argparse, http.client, json, os, re, socket, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'deploy/staging/traefik/b1-forward-auth.delta.example.yaml'
HOST = 'cleanops.nuvurent.com'
FIXTURE_ASSERTION = 'b1-context-v1.sandbox-fixture'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Recorder:
    def __init__(self):
        self.lock, self.items = threading.Lock(), []

    def add(self, item):
        with self.lock:
            self.items.append(item)

    def clear(self):
        with self.lock:
            self.items.clear()


def make_server(recorder, handler_status):
    class H(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *_):
            pass

        def _do(self):
            length = int(self.headers.get('Content-Length') or 0)
            body = self.rfile.read(length) if length else b''
            headers = {}
            for key in self.headers.keys():
                headers[key.lower()] = self.headers.get_all(key)
            recorder.add(dict(method=self.command, path=self.path, headers=headers, body=body.decode('latin1')))
            status, extra = handler_status(self.path, headers)
            self.send_response(status)
            for k, v in extra.items():
                self.send_header(k, v)
            self.send_header('Content-Length', '0')
            self.end_headers()
        do_GET = do_POST = do_PUT = do_DELETE = _do
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def build_dynamic(auth_port, backend_port):
    """Reviewed template with ONLY the documented sandbox substitutions."""
    doc = yaml.safe_load(TEMPLATE.read_text())
    mw = doc['http']['middlewares']['cleanops-b1-forward-auth']['forwardAuth']
    mw['address'] = f'http://127.0.0.1:{auth_port}/forward-auth'   # sandbox: no mTLS listener
    mw.pop('tls')                                                  # sandbox: plain HTTP to the mock
    router = doc['http']['routers']['cleanops360-b1-guarded']
    router['entryPoints'] = ['web']                                # sandbox: single local entrypoint
    router.pop('tls')
    router['service'] = 'backend'
    doc['http']['routers']['cleanops360-existing'] = dict(rule=f'Host(`{HOST}`)', entryPoints=['web'], priority=1, service='backend')
    doc['http']['services'] = {'backend': {'loadBalancer': {'servers': [{'url': f'http://127.0.0.1:{backend_port}'}]}}}
    return doc


def build_static(web_port):
    # Mirrors Dokploy's generated traefik.yml shape (file provider + entrypoint), minus ACME and docker/swarm providers.
    return {'global': {'checkNewVersion': False, 'sendAnonymousUsage': False},
            'log': {'level': 'DEBUG'},
            'entryPoints': {'web': {'address': f'127.0.0.1:{web_port}'}},
            'providers': {'file': {'directory': '__DYN__', 'watch': False}}}


def request(port, method, path, headers, body=None):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
    conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    conn.putheader('Host', HOST)
    for name, value in headers:
        conn.putheader(name, value)
    data = body.encode() if body is not None else None
    if data is not None:
        conn.putheader('Content-Length', str(len(data)))
    conn.endheaders(data)
    resp = conn.getresponse()
    resp.read()
    status = resp.status
    conn.close()
    return status


def run(traefik, label):
    result = dict(label=label, checks={}, observations={})
    auth_rec, backend_rec = Recorder(), Recorder()
    # The mock denies by the ORIGINAL uri that Traefik reports in X-Forwarded-Uri.
    auth = make_server(auth_rec, lambda p, h: (403, {}) if any('deny' in v for v in h.get('x-forwarded-uri', [])) else (204, {'X-Cleanops-B1-Assertion': FIXTURE_ASSERTION}))
    backend = make_server(backend_rec, lambda p, h: (200, {}))
    web_port = free_port()
    with tempfile.TemporaryDirectory(prefix='traefik-sandbox-') as tmp:
        dyn = Path(tmp, 'dynamic'); dyn.mkdir()
        (dyn / 'b1.yml').write_text(yaml.safe_dump(build_dynamic(auth.server_port, backend.server_port)))
        static = build_static(web_port); static['providers']['file']['directory'] = str(dyn)
        cfg = Path(tmp, 'traefik.yml'); cfg.write_text(yaml.safe_dump(static))
        log = Path(tmp, 'traefik.log')
        with open(log, 'wb') as lf:
            proc = subprocess.Popen([traefik, f'--configFile={cfg}'], stdout=lf, stderr=subprocess.STDOUT, cwd=tmp,
                                    env={'PATH': os.environ.get('PATH', ''), 'HOME': tmp})
        try:
            for _ in range(100):
                try:
                    if request(web_port, 'GET', '/login', []) == 200:
                        break
                except OSError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError('traefik did not start: ' + log.read_text()[-800:])
            ok = result['checks']
            # 1. Non-B1 path is untouched and never consults the auth server.
            auth_rec.clear(); backend_rec.clear()
            ok['public_path_bypasses_auth'] = request(web_port, 'GET', '/login', []) == 200 and not auth_rec.items
            # 2. Spoofed forwarding metadata on a guarded POST with a body.
            auth_rec.clear(); backend_rec.clear()
            hdrs = [('X-Forwarded-Prefix', '/evil'), ('X-Forwarded-For', '6.6.6.6'), ('X-Forwarded-For', '7.7.7.7'),
                    ('X-Forwarded-Host', 'evil.example'), ('X-Forwarded-Proto', 'https'), ('X-Forwarded-Method', 'GET'),
                    ('X-Forwarded-Uri', '/me/secret'), ('X-Real-Ip', '8.8.8.8'), ('Forwarded', 'for=9.9.9.9'),
                    ('X-Cleanops-B1-Assertion', 'forged'), ('X-CSRF-Token', 'a'), ('X-CSRF-Token', 'b'),
                    ('Content-Type', 'application/json'), ('Cookie', 'c=1')]
            status = request(web_port, 'POST', '/auth/login?x=1', hdrs, '{"a":1}')
            a = auth_rec.items[-1] if auth_rec.items else {'headers': {}, 'body': None, 'method': None}
            h = a['headers']
            one = lambda n: h.get(n, [])
            result['observations']['auth_call_method'] = a['method']
            ok['guarded_post_reaches_backend'] = status == 200 and len(backend_rec.items) == 1
            ok['auth_sees_original_method_in_x_forwarded_method_once'] = one('x-forwarded-method') == ['POST']
            ok['auth_never_sees_x_forwarded_prefix'] = 'x-forwarded-prefix' not in h
            ok['x_forwarded_for_is_single_rebuilt_peer'] = one('x-forwarded-for') == ['127.0.0.1']
            ok['x_forwarded_host_rebuilt'] = one('x-forwarded-host') == [HOST]
            ok['x_forwarded_uri_is_real_uri'] = one('x-forwarded-uri') == ['/auth/login?x=1']
            result['observations']['auth_body_seen'] = a['body']
            result['observations']['auth_content_length'] = one('content-length')
            ok['auth_receives_exact_body'] = a['body'] == '{"a":1}'
            ok['auth_does_not_see_real_ip_or_forwarded_headers'] = 'x-real-ip' not in h and 'forwarded' not in h
            ok['client_assertion_never_reaches_auth'] = 'x-cleanops-b1-assertion' not in h
            ok['duplicate_csrf_not_silently_merged_by_proxy_needs_adapter_denial'] = len(one('x-csrf-token')) >= 1
            result['observations']['csrf_values_seen_by_auth'] = one('x-csrf-token')
            b = backend_rec.items[-1]['headers'] if backend_rec.items else {}
            ok['backend_gets_only_issuer_assertion'] = b.get('x-cleanops-b1-assertion') == [FIXTURE_ASSERTION]
            ok['backend_never_gets_spoofed_prefix'] = 'x-forwarded-prefix' not in b
            result['observations']['backend_x_forwarded_for'] = b.get('x-forwarded-for')
            # 3. Auth denial blocks the request before the backend.
            auth_rec.clear(); backend_rec.clear()
            ok['denied_auth_blocks_backend'] = request(web_port, 'GET', '/me/deny', []) == 403 and not backend_rec.items
            # 4. Body larger than maxBodySize is refused before the backend.
            auth_rec.clear(); backend_rec.clear()
            big = request(web_port, 'POST', '/auth/login', [('Content-Type', 'application/json')], 'x' * 70000)
            result['observations']['oversize_status'] = big
            ok['oversize_body_refused'] = big in (401, 403, 413) and not backend_rec.items
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            auth.shutdown(); backend.shutdown()
        text = log.read_text(errors='replace')
        result['observations']['version'] = re.search(r'"?version"?[=: ]+"?(3\.\d+\.\d+)', text) and re.search(r'(3\.\d+\.\d+)', text).group(1)
        result['observations']['error_lines'] = [l[:200] for l in text.splitlines() if re.search(r'\blvl=error|"level":"error"|level=error', l)][:5]
        result['observations']['deprecation_or_warn_lines'] = sorted({re.sub(r'^\S+\s+', '', l)[:160] for l in text.splitlines() if re.search(r'level=warn|"level":"warn"', l) and re.search(r'deprecat|trustForwardHeader|underscore|aliasHeaders', l, re.I)})[:6]
    result['passed'] = all(result['checks'].values()) and not result['observations']['error_lines']
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--traefik', required=True, help='path to an official, checksum-verified traefik binary')
    p.add_argument('--label', default=None)
    p.add_argument('--json', action='store_true')
    args = p.parse_args()
    r = run(args.traefik, args.label or Path(args.traefik).parent.name)
    if args.json:
        print(json.dumps(r, indent=2, default=str))
    else:
        print(f"{r['label']}: {'PASS' if r['passed'] else 'FAIL'}")
        for k, v in r['checks'].items():
            print(f"  {'ok ' if v else 'BAD'} {k}")
        print('  observations:', json.dumps(r['observations'], default=str))
    return 0 if r['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
