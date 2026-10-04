"""Save original native pixels and full AX frames for the review-only simulator."""
import json
from pathlib import Path
import subprocess
import sys

UDID = 'B0603E58-8D8E-485C-B2C6-BB3B931444C2'
ev = Path(__file__).resolve().parent / 'native'
ev.mkdir(exist_ok=True)
name = sys.argv[1]
assert name.replace('-', '').isalnum()
r = subprocess.run(['axe','describe-ui','--udid',UDID], capture_output=True,text=True,check=True)
(ev/(name+'.json')).write_text(r.stdout)
subprocess.run(['xcrun','simctl','io',UDID,'screenshot',str(ev/(name+'.png'))],capture_output=True,check=True)
print('Saved full native AX and PNG:',name)
