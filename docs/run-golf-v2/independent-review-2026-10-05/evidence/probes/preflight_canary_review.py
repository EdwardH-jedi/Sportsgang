import sys,io,json,contextlib,tempfile,subprocess,pathlib
REPO=pathlib.Path(__file__).resolve().parents[5];sys.path.insert(0,str(REPO/'scripts/release'))
import preflight
from test_preflight import make_repo
E=REPO/'docs/run-golf-v2/independent-review-2026-10-05/evidence'
with tempfile.TemporaryDirectory(prefix='sg-preflight-review-') as d:
 root=pathlib.Path(d);make_repo(root)
 for args in (['init','-q'],['add','.'],['-c','user.name=Synthetic Review','-c','user.email=synthetic@example.test','commit','-qm','fixture']):
  subprocess.run(['git','-C',str(root),*args],check=True)
 (root/'sgShort9K2.txt').write_text('synthetic canary filename')
 results=[]
 for args in ([],['--json']):
  out=io.StringIO()
  with contextlib.redirect_stdout(out):rc=preflight.main(['--root',str(root),*args],environ={'SG_REVIEW_SECRET':'sgShort9K2','PATH':'/usr/bin:/bin'})
  value=out.getvalue();results.append({'mode':'json' if args else 'text','exit':rc,'non_allowlisted_canary_leaked':'sgShort9K2' in value})
  (E/'logs'/('preflight-short-final-'+('json' if args else 'text')+'.log')).write_text(value)
 (E/'preflight-short-canary-final.json').write_text(json.dumps(results,indent=2)+'\n');print(results)
 assert not any(r['non_allowlisted_canary_leaked'] for r in results),'short non-allowlisted env value leaked'
