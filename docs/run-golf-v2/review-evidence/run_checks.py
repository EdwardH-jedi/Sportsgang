"""Read-only application verification; logs and generated files stay in review paths."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
TARGET = ROOT / '.claude/worktrees/run-golf-v2'
OUT = Path(__file__).resolve().parent
TMP = Path('/private/tmp/codex-sg-review-20261003')
ENV = dict(os.environ, APP_ENV='local', SECRET_KEY='codex-local-review-only-32-characters',
           POSTGRES_URL='postgresql://review:local-review-only@127.0.0.1:55443/codex_review',
           REDIS_URL='redis://127.0.0.1:56443/0', GOOGLE_PLACES_API_KEY='',
           GOOGLE_CLIENT_ID='', GOOGLE_CLIENT_SECRET='', APPLE_PRIVATE_KEY='',
           APPLE_CLIENT_ID='', FIELD_ENCRYPTION_KEY='', INTERNAL_API_TOKEN='',
           MEDIA_ROOT=str(TMP / 'media'), UV_CACHE_DIR=str(TMP / 'uv-cache'),
           EXPO_PUBLIC_API_URL='http://127.0.0.1:8023', CI='1')

def run(name, command, cwd, timeout=600):
    started = time.time()
    with (OUT / f'{name}.log').open('w') as log:
        try:
            p = subprocess.run(command, cwd=cwd, env=ENV, stdout=log,
                               stderr=subprocess.STDOUT, timeout=timeout)
            code = p.returncode
        except subprocess.TimeoutExpired:
            code = 124
    result = dict(name=name, command=command, cwd=str(cwd), exit_code=code,
                  elapsed_seconds=round(time.time()-started, 2),
                  head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=TARGET,text=True).strip())
    (OUT / f'{name}.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result), flush=True)
    return code

if __name__ == '__main__':
    group = sys.argv[1]
    if group == 'mobile':
        run('npm-ci', ['npm','ci','--offline'], TARGET)
        run('mobile-lint', ['npm','run','lint','--workspace','@protin/mobile'], TARGET)
        run('mobile-typecheck', ['npm','run','typecheck','--workspace','@protin/mobile'], TARGET)
        run('shared-typecheck', ['npm','run','typecheck','--workspace','@protin/shared-types','--',
                                '--tsBuildInfoFile',str(TMP/'shared.tsbuildinfo')],TARGET)
        run('mobile-tests',['npm','run','test:ci','--workspace','@protin/mobile','--','--runInBand'],TARGET)
        run('ios-export',['npx','--no-install','expo','export','--platform','ios','--output-dir',str(TMP/'ios-export')],TARGET/'apps/mobile')
    elif group == 'api':
        run('uv-sync',['uv','sync','--frozen','--dev','--offline'],TARGET/'apps/api')
        run('ruff-check',['uv','run','--offline','ruff','check','.'],TARGET/'apps/api')
        run('ruff-format',['uv','run','--offline','ruff','format','--check','.'],TARGET/'apps/api')
        run('api-tests',['uv','run','--offline','pytest','-q'],TARGET/'apps/api')
    elif group == 'integration':
        if run('alembic-fresh',['uv','run','--offline','alembic','upgrade','head'],TARGET/'apps/api') == 0:
            run('integration-tests',['uv','run','--offline','pytest','tests_integration','-q'],TARGET/'apps/api')
