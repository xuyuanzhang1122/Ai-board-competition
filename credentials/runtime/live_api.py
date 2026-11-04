import json,urllib.request,urllib.error
from pathlib import Path
D=Path(__file__).resolve().parent
def call(path,body=None,admin=False,method=None):
 token=json.loads((D/('admin-session.json' if admin else 'chat-user-session.json')).read_text())['token']
 request=urllib.request.Request('http://127.0.0.1:18080'+path,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
 try:
  with urllib.request.urlopen(request,timeout=130) as response: return json.load(response)
 except urllib.error.HTTPError as error: return {'httpStatus':error.code,**json.load(error)}
def save(name,data):
 (D/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
