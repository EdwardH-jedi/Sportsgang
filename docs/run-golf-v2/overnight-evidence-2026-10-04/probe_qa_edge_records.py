"""Additional stale/interrupted owner and source-status probes; no services signalled."""
import hashlib,importlib.util,json,os,pathlib
from unittest.mock import patch
from scripts.qa.test_qa import LauncherCase
root=pathlib.Path(os.environ['REVIEW_ROOT']);ev=pathlib.Path(os.environ['REVIEW_EVIDENCE']);results=[]
def record(name,actual,expected):
 results.append({'name':name,'actual':actual,'expected':expected,'status':'PASS' if actual==expected else 'FAIL'});print(results[-1])
old=os.environ.get('SPORTSGANG_QA_HOME');case=LauncherCase();case.setUp()
try:
 qa=case.qa;cfg=case.config(qa)
 with patch.object(qa,'project_containers',return_value=[]),patch.object(qa,'volume_exists',return_value=False):
  qa.claim(cfg);path=qa.owner_path(cfg);owner=json.loads(path.read_text());owner['worktree']=str(case.tmp/'deleted-worktree');path.write_text(json.dumps(owner));before=path.read_bytes()
  try:qa.claim(cfg);out='accepted'
  except SystemExit:out='refused'
  record('stale nonexistent owner path refuses takeover',out,'refused');record('stale owner record preserved',path.read_bytes()==before,True)
  path.write_text('{"project":');before=path.read_bytes()
  try:qa.claim(cfg);out='accepted'
  except json.JSONDecodeError:out='JSONDecodeError before mutation'
  record('interrupted owner write fails closed',out,'JSONDecodeError before mutation');record('interrupted record preserved',path.read_bytes()==before,True)
finally:
 case.tearDown()
 if old is not None:os.environ['SPORTSGANG_QA_HOME']=old
spec=importlib.util.spec_from_file_location('status_probe',root/'scripts/qa/qa.py');qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa);qa.configure(root)
for name in ['api','metro']:
 unchanged=qa._source_line(name,{'source_sha':'ecd1e86047cdc4411905d43210bc07112bbcbf07'}, {})
 changed=qa._source_line(name,{'source_sha':'b530e7f3e726b9e830e52259f0ae699725090f5f'}, {})
 record(name+' doc-only later HEAD remains same source','unchanged since' in unchanged,True)
 record(name+' changed code requires restart','changed since' in changed and 'qa:restart' in changed,True)
(ev/'qa-edge-records.json').write_text(json.dumps(results,indent=2));print('RESULT',len(results),'checks',all(r['status']=='PASS' for r in results))
