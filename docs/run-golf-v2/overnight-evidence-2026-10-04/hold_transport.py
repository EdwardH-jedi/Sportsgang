"""Disposable native retry transport: accept GET and withhold its response.
Start only after stopping the isolated reviewer API. Never log headers or tokens.
"""
import http.server,threading,urllib.parse
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  print('held GET '+urllib.parse.urlsplit(self.path).path,flush=True)
  threading.Event().wait(60)
http.server.ThreadingHTTPServer(('127.0.0.1',8144),Handler).serve_forever()
