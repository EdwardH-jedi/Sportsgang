"""Private-config command runner; stores actual argv, exit, duration and output.

Run: python run_check.py NAME api|root -- COMMAND ...
Secrets live only in the ignored reviewer .qa/config.env. Never prints env.
"""
import json
import os
import pathlib
import subprocess
import sys
import time

root = pathlib.Path(__file__).resolve().parents[4]
ev = pathlib.Path(__file__).resolve().parent
cfg = dict(line.split('=', 1) for line in (root / '.qa/config.env').read_text().splitlines())
assert cfg['QA_PROJECT'] == 'sg-morning-review-20261004'
database = os.environ.get('REVIEW_DATABASE', 'sportsgang_qa')
assert database in {'sportsgang_qa', 'sg_review_full', 'sg_review_sydney'}
env = dict(os.environ, APP_ENV='local', SECRET_KEY=cfg['QA_SECRET_KEY'],
           POSTGRES_URL=f"postgresql://sportsgang_qa:{cfg['QA_PG_PASSWORD']}@127.0.0.1:{cfg['QA_PG_PORT']}/{database}",
           REDIS_URL=f"redis://127.0.0.1:{cfg['QA_REDIS_PORT']}/0",
           EXPO_PUSH_URL='', REVIEW_ROOT=str(root), REVIEW_EVIDENCE=str(ev),
           SPORTSGANG_QA_HOME='/private/tmp/sg-morning-review-private-20261004/owners',
           UV_CACHE_DIR='/Users/edwardhwang/.cache/uv')
name, where, *args = sys.argv[1:]
if args and args[0] == '--':
    args = args[1:]
cwd = root / 'apps/api' if where == 'api' else root
start = time.monotonic()
with (ev / f'{name}.log').open('w') as log:
    p = subprocess.run(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
elapsed = time.monotonic() - start
entry = dict(name=name, command=args, cwd=str(cwd), exit_code=p.returncode, seconds=round(elapsed, 3))
with (ev / 'checks.jsonl').open('a') as f:
    f.write(json.dumps(entry) + '\n')
print(json.dumps(entry))
print('\n'.join((ev / f'{name}.log').read_text().splitlines()[-18:]))
sys.exit(p.returncode)
