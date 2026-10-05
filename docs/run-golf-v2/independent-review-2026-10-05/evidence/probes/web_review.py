import base64,json,pathlib,subprocess,tempfile,time,urllib.request,hashlib
from websockets.sync.client import connect
REPO=pathlib.Path(__file__).resolve().parents[5];E=REPO/'docs/run-golf-v2/independent-review-2026-10-05/evidence/web';E.mkdir(exist_ok=True)
profile=tempfile.TemporaryDirectory(prefix='sg-chrome-review-')
chrome=subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new',f'--user-data-dir={profile.name}','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-component-update','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  f=pathlib.Path(profile.name)/'DevToolsActivePort'
  if f.exists():break
  time.sleep(.1)
 port=f.read_text().splitlines()[0]
 req=urllib.request.Request(f'http://localhost:{port}/json/new?http://127.0.0.1:5291/',method='PUT')
 target=json.load(urllib.request.urlopen(req));ws=connect(target['webSocketDebuggerUrl'], max_size=None);seq=0
 def call(method,params=None):
  global seq
  seq+=1;ws.send(json.dumps({'id':seq,'method':method,'params':params or {}}))
  while True:
   r=json.loads(ws.recv(timeout=15))
   if r.get('id')==seq:
    if 'error' in r:raise RuntimeError(r)
    return r.get('result',{})
 def js(expression):
  r=call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
  if 'exceptionDetails' in r:raise RuntimeError(r)
  return r['result'].get('value')
 def navigate(url):
  call('Page.navigate',{'url':url});time.sleep(.4)
  js("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
 def shot(name):
  (E/(name+'.png')).write_bytes(base64.b64decode(call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})['data']))
 call('Page.enable');call('Runtime.enable');results={'browser':json.load(urllib.request.urlopen(f'http://localhost:{port}/json/version'))['Browser'],'layouts':[]}
 for width,height in [(320,844),(390,844),(768,1024),(1440,1000)]:
  call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False});navigate('http://127.0.0.1:5291/')
  results['layouts'].append(js("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,details:[...document.querySelectorAll('details')].length,buttons:[...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label')||b.textContent.trim(),expanded:b.getAttribute('aria-expanded')}))})"));shot(f'home-{width}')
 call('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]});navigate('http://127.0.0.1:5291/');results['reduced_motion']=js("({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,animated:[...document.querySelectorAll('[data-reveal]')].map(e=>getComputedStyle(e).opacity)})")
 call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
 results['faq_before']=js("[...document.querySelectorAll('#faq details')].map(e=>e.open)")
 pdf=call('Page.printToPDF',{'printBackground':True,'paperWidth':8.27,'paperHeight':11.69,'preferCSSPageSize':False});(E/'home-a4.pdf').write_bytes(base64.b64decode(pdf['data']))
 results['faq_after']=js("[...document.querySelectorAll('#faq details')].map(e=>e.open)")
 js("document.querySelector('#faq details').open=true")
 results['faq_mixed_before']=js("[...document.querySelectorAll('#faq details')].map(e=>e.open)")
 js("dispatchEvent(new Event('beforeprint'))")
 results['faq_during']=js("[...document.querySelectorAll('#faq details')].map(e=>e.open)")
 js("dispatchEvent(new Event('afterprint'))")
 results['faq_mixed_after']=js("[...document.querySelectorAll('#faq details')].map(e=>e.open)")
 call('Emulation.setScriptExecutionDisabled',{'value':True})
 results['no_js']=[]
 for name in ('','privacy','terms','support'):
  call('Page.navigate',{'url':'http://127.0.0.1:5291/'+name});time.sleep(.7);results['no_js'].append(js("({url:location.pathname,title:document.title,text:document.body.innerText.slice(0,300),width:document.documentElement.scrollWidth})"));shot('no-js-'+(name or 'home'))
 call('Emulation.setScriptExecutionDisabled',{'value':False})
 (E/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results,indent=2))
 ws.close()
finally:
 chrome.terminate();chrome.wait(timeout=10);profile.cleanup()
