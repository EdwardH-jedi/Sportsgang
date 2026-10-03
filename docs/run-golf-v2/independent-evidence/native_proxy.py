import json,re,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
P=Path(__file__).parent
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def do_PUT(self):self.forward()
 def do_DELETE(self):self.forward()
 def forward(self):
  mode=(P/'proxy-mode.txt').read_text().strip()
  fail= mode=='all' or (mode=='events' and self.path.startswith('/events')) or (mode=='bookings' and self.path.startswith('/bookings')) or (mode=='detail' and self.path.startswith('/bookings/'))
  if fail:
   self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"detail":"Independent review injected local failure"}');return
  size=int(self.headers.get('Content-Length','0'));body=self.rfile.read(size) if size else None
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','connection','accept-encoding')}
  req=urllib.request.Request('http://127.0.0.1:8130'+self.path,data=body,headers=headers,method=self.command)
  try:r=urllib.request.urlopen(req,timeout=20)
  except urllib.error.HTTPError as e:r=e
  with r:
   self.send_response(r.status)
   for k,v in r.headers.items():
    if k.lower() not in ('transfer-encoding','connection','content-length'):self.send_header(k,v)
   self.end_headers();self.wfile.write(r.read())
 def log_message(self,format,*args):
  with open(P/'native-proxy.log','a') as f:f.write(re.sub(r'([?&]token=)[^ &"]+',r'\1[REDACTED]',format%args)+'\n')
ThreadingHTTPServer(('127.0.0.1',8143),Handler).serve_forever()
