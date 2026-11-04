from pathlib import Path
import json,re,uuid,time,urllib.request,urllib.error,urllib.parse,fcntl,os
D=Path(__file__).parent;ledger=D/'kling-image-probe-ledger.json'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('Redirect refused')
lines=Path('/Users/xumy/Downloads/key/api-key.txt').read_text().splitlines()
line=next(v for v in lines if re.search(r'kling|可灵',v,re.I))
raw=re.sub(r'^.*?(?:kling|可灵)\s*[:：=\-]?\s*','',line,flags=re.I)
parts=[v.strip('"\'`') for v in re.split(r'[\s:：=,，]+',raw) if v]
key=next((v for v in reversed(parts) if re.fullmatch(r'[A-Za-z0-9_-]{25,200}',v)),None)
if not key:raise SystemExit('No unambiguous Kling API Key found; no requests made')
(D/'kling-api.env').write_text('KLING_API_KEY='+key+'\n');os.chmod(D/'kling-api.env',0o600)
base='https://api-beijing.klingai.com';opener=urllib.request.build_opener(NoRedirect)
def call(path,body=None):
 request=urllib.request.Request(base+path,data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 try:
  with opener.open(request,timeout=20) as response:return json.load(response)
 except urllib.error.HTTPError as e:
  try:r=json.load(e)
  except Exception:r={}
  return {'httpStatus':e.code,**r}
 except urllib.error.URLError as e:
  return {'code':None,'transportError':type(e.reason).__name__}
def public(r):return {'httpStatus':r.get('httpStatus',200),'code':r.get('code'),'message':str(r.get('message','')).replace(key,'[redacted]')[:200]}
def save(state):ledger.write_text(json.dumps(state,ensure_ascii=False,indent=2));os.chmod(ledger,0o600)
with (D/'kling-image-probe.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 s=json.loads(ledger.read_text()) if ledger.exists() else {'budgetPoints':100,'reservedPoints':0,'estimatedUnitPoints':8,'attempts':0,'externalTaskId':'competition-image-'+str(uuid.uuid4())}
 if not s.get('taskId') and not s.get('submissionState'):
  auth=call('/v1/images/generations?pageNum=1&pageSize=1')
  s['authProbe']=public(auth);save(s)
  if auth.get('code')!=0:
   print(json.dumps({'auth':s['authProbe'],'paidPostCount':0,'reservedPoints':s['reservedPoints']},ensure_ascii=False),flush=True);raise SystemExit(2)
  body={'model_name':'kling-v3','prompt':'电影分镜画面，纯虚构的海边灯塔，黄昏，暖黄色灯光照向平静海面，温暖宁静，简洁构图，无人物，无文字，无真实品牌。','n':1,'resolution':'1k','aspect_ratio':'16:9','external_task_id':s['externalTaskId']}
  assert s['reservedPoints']+8<=s['budgetPoints'] and body['n']==1 and body['resolution']=='1k'
  s.update({'request':body,'reservedPoints':s['reservedPoints']+8,'attempts':s['attempts']+1,'submissionState':'SUBMITTING','submittedAt':time.strftime('%Y-%m-%d %H:%M:%S %z')});save(s)
  response=call('/v1/images/generations',body);s['submission']=response
  if response.get('code')==0 and response.get('data',{}).get('task_id'):
   s['taskId']=str(response['data']['task_id']);s['submissionState']='ACCEPTED';save(s)
  else:
   s['submissionState']='REJECTED_OR_UNCERTAIN';save(s)
   print(json.dumps({'submission':public(response),'attempts':s['attempts'],'reservedPoints':s['reservedPoints'],'willResubmit':False},ensure_ascii=False),flush=True);raise SystemExit(3)
 if not s.get('taskId'):
  print(json.dumps({'submissionState':s.get('submissionState'),'willResubmit':False,'reservedPoints':s['reservedPoints']},ensure_ascii=False),flush=True);raise SystemExit(4)
 assert re.fullmatch(r'[A-Za-z0-9_-]{1,128}',s['taskId'])
 print(json.dumps({'taskId':s['taskId'],'reservedPoints':s['reservedPoints'],'paidPostCount':s['attempts']},ensure_ascii=False),flush=True)
 for _ in range(40):
  result=call('/v1/images/generations/'+urllib.parse.quote(s['taskId'],safe=''));s['queryResult']=result;save(s)
  if result.get('code')!=0:
   if result.get('transportError') or result.get('httpStatus',200)>=500:
    time.sleep(3);continue
   print(json.dumps(public(result),ensure_ascii=False),flush=True);raise SystemExit(5)
  data=result.get('data') or {};status=data.get('task_status')
  if status in ('succeed','failed'):
   s['finalStatus']=status;s['actualPoints']=data.get('final_unit_deduction');save(s)
   print(json.dumps({'status':status,'actualPoints':s['actualPoints'],'imageCount':len((data.get('task_result') or {}).get('images') or []),'reservedPoints':s['reservedPoints'],'paidPostCount':s['attempts']},ensure_ascii=False),flush=True);break
  time.sleep(3)
 else:print('Task still pending; ledger keeps taskId; future runs query only, never resubmit',flush=True)
