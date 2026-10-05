import subprocess, pathlib, hashlib, json, sys
root=pathlib.Path('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang')
def git(*args,cwd=root): return subprocess.check_output(['git',*args],cwd=cwd).decode().strip()
items=[]
for block in git('worktree','list','--porcelain').split('\n\n'):
 p=pathlib.Path(block.splitlines()[0][9:]); hashes={}
 for name in subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=p).decode().split('\0'):
  f=p/name
  if name and f.is_file() and 'independent-review-2026-10-05/' not in name:
   hashes[name]=hashlib.sha256(f.read_bytes()).hexdigest()
 items.append({'path':str(p),'head':git('rev-parse','HEAD',cwd=p),'status':git('status','--porcelain=v1','--untracked-files=all',cwd=p),'hashes':hashes})
containers=json.loads(subprocess.check_output(['docker','ps','--format','{{json .}}']).decode().replace('\n','\n') and '['+','.join(subprocess.check_output(['docker','ps','--format','{{json .}}']).decode().splitlines())+']')
pathlib.Path(sys.argv[1]).write_text(json.dumps({'worktrees':items,'containers':containers,'stash':git('stash','list')},indent=2)+'\n')
print(f'Snapshotted {len(items)} worktrees and {len(containers)} containers')
