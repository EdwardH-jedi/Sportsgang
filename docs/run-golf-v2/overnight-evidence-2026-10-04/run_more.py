import os,pathlib,json,subprocess
root=pathlib.Path(os.environ['REVIEW_ROOT']);ev=pathlib.Path(os.environ['REVIEW_EVIDENCE']);boot=pathlib.Path(os.environ['REVIEW_BOOT']);env=json.loads((boot/'env.json').read_text());rows=[]
def run(name,args,overrides=None):
 with (ev/(name+'.log')).open('w') as f:p=subprocess.run(args,cwd=root/'apps/api',env={**env,**(overrides or {})},stdout=f,stderr=subprocess.STDOUT,stdin=subprocess.DEVNULL)
 rows.append(dict(name=name,args=args,exit=p.returncode));(ev/'more-checks.json').write_text(json.dumps(rows,indent=2));print(name,p.returncode,flush=True)
run('r1-probe-verified',[str(root/'apps/api/.venv/bin/python'),str(ev/'probe_r1.py')])
run('audit-sydney-configured',['uv','run','--frozen','pytest','tests_integration/test_audit_instants.py','-q'],{'DB_NAIVE_TIMEZONE':'Australia/Sydney','TZ':'Australia/Sydney'})
for n in ['probe_findings','verify_populated_upgrade']:
 s=(root/f'docs/run-golf-v2/fix-evidence/{n}.py').read_text();(ev/f'adapted_{n}.py').write_text('# REVIEW ADAPTER: disposable port guard 55453 -> 55504 only.\n'+s.replace('55453','55504'))
for tz in ['UTC','Australia/Sydney']:
 run('f-regressions-'+tz.replace('/','-'),[str(root/'apps/api/.venv/bin/python'),str(ev/'adapted_probe_findings.py'),str(ev/('f-regressions-'+tz.replace('/','-')+'.json'))],{'TZ':tz,'PYTHONPATH':str(root/'apps/api')})
run('create-legacy-db',['docker','exec','sg-codex-r1r7-pg','createdb','-U','review','sg_legacy'])
run('populated-upgrade',[str(root/'apps/api/.venv/bin/python'),str(ev/'adapted_verify_populated_upgrade.py'),str(ev/'populated-upgrade.json')],{'POSTGRES_URL':env['POSTGRES_URL'].replace('/sg_review','/sg_legacy'),'PYTHONPATH':str(root/'apps/api')})
