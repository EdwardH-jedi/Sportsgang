import os,pathlib,json,subprocess,time,shutil,sys
REPO=pathlib.Path(__file__).resolve().parents[5]; E=REPO/'docs/run-golf-v2/independent-review-2026-10-05/evidence'
env=os.environ.copy();env.update(json.loads(pathlib.Path('/private/tmp/sg_review_env_20261005.json').read_text()));env['REVIEW_EVIDENCE']=str(E/'authority-extra');pathlib.Path(env['REVIEW_EVIDENCE']).mkdir(exist_ok=True)
env['PYTHONPATH']=str(REPO/'apps/api')+':'+str(REPO/'apps/api/tests_integration')
old=pathlib.Path('/private/tmp/sportsgang-morning-acceptance-20261004/docs/run-golf-v2/morning-acceptance/evidence')
for name in ('test_independent_followups.py','test_independent_block_first.py'):
 (E/'probes'/name).write_text((old/name).read_text().replace(':55752/',':55781/'))
checks=[('original-reviewer-probes',['.venv/bin/python','-m','pytest',str(E/'probes/test_independent_followups.py'),str(E/'probes/test_independent_block_first.py'),'-q','-rs','--asyncio-mode=auto']),('cancellation-crash-review',['.venv/bin/python','-m','pytest',str(E/'probes/test_cancellation_review.py'),'-q','-rs','--asyncio-mode=auto'])]
for name,command in checks:
 start=time.monotonic()
 with (E/'logs'/f'{name}-final.log').open('w') as f:
  p=subprocess.run(command,cwd=REPO/'apps/api',env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240)
 (E/'logs'/f'{name}-final.result.json').write_text(json.dumps({'exit':p.returncode,'seconds':time.monotonic()-start,'command':command})+'\n')
 print(name,p.returncode,flush=True);print((E/'logs'/f'{name}-final.log').read_text()[-1500:],flush=True)
