"""Stop only the verified temporary recording API used by this review."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import time

root = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('review_qa', root / 'scripts/qa/qa.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
pid = 28919
actual = qa.proc_identity(pid)
expected = '../../docs/run-golf-v2/morning-acceptance/evidence/native_recording_api.py'
assert actual and actual['cwd'] == str(root / 'apps/api'), actual
assert actual['command'].endswith(' ' + expected), actual
assert qa.proc_identity(pid) == actual
os.kill(pid, signal.SIGTERM)
deadline = time.monotonic() + 10
while time.monotonic() < deadline and qa.proc_identity(pid):
    time.sleep(.1)
assert qa.proc_identity(pid) is None, 'Reviewer API did not exit; no further signals sent'
out = {'verified_identity':actual,'signal':'SIGTERM','exited':True}
(Path(__file__).parent/'recording-api-cleanup.json').write_text(json.dumps(out,indent=2)+'\n')
print('Exact reviewer API identity verified; graceful exit confirmed')
