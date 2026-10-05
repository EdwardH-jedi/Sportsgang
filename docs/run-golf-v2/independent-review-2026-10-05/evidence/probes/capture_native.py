import json,pathlib,subprocess,sys
UDID='C17D665C-69FC-474D-A7B0-6EB8201128F2';E=pathlib.Path(__file__).resolve().parents[1]/'native';E.mkdir(exist_ok=True)
name=sys.argv[1];assert name.replace('-','').isalnum()
r=subprocess.check_output(['axe','describe-ui','--udid',UDID]);(E/(name+'.json')).write_bytes(r)
subprocess.run(['xcrun','simctl','io',UDID,'screenshot',str(E/(name+'.png'))],capture_output=True,check=True)
rows=[]
def walk(v):
 if isinstance(v,dict):
  if v.get('type') in ('Button','TextField') or v.get('AXLabel') in ('Back','More options','Propose a session','Message…','Send','Next keyboard'):
   f=v.get('frame',{});rows.append({'label':v.get('AXLabel'),'type':v.get('type'),'frame':f,'inside_width':f.get('x',0)>=0 and f.get('x',0)+f.get('width',0)<=390.01})
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(json.loads(r));(E/(name+'-frames.json')).write_text(json.dumps(rows,indent=2)+'\n');print('Captured',name)
