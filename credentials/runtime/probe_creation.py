from pathlib import Path
import json,uuid,time,urllib.request,sys
from live_api import call
D=Path(__file__).parent;statepath=D/'creation-live-evidence.json'
s=json.loads(statepath.read_text()) if statepath.exists() else {'createRequestId':str(uuid.uuid4()),'projectRequestId':str(uuid.uuid4())}
def save():statepath.write_text(json.dumps(s,ensure_ascii=False,indent=2))
def api(path,body=None,method=None):
 r=call(path,body,method=method)
 if r.get('code')!=200:raise RuntimeError(json.dumps({'path':path,'code':r.get('code'),'message':r.get('message')},ensure_ascii=False))
 return r['data']
def detail():return api('/api/creation/drafts/'+str(s['draftId']))
def request_run(d,stage,key):
 if key not in s:
  s[key]={'requestId':str(uuid.uuid4()),'revision':d['revision'],'stage':stage,'model':s['model']};save()
 run=api('/api/creation/drafts/'+str(d['id'])+'/runs',s[key]);s[stage+'RunId']=run['id'];s[stage+'JobId']=run['jobId'];save()
 start=time.monotonic()
 while time.monotonic()-start<130:
  d=detail();run=next(v for v in d['runs'] if v['id']==run['id'])
  if run['status'] not in ['PENDING','RUNNING']:
   s[stage+'Result']=run;save()
   print(json.dumps({'stage':stage,'status':run['status'],'jobId':run['jobId'],'outputLength':len(run.get('output') or ''),'error':run.get('error')},ensure_ascii=False),flush=True)
   if run['status']!='SUCCEEDED':raise RuntimeError('Generation did not produce a valid candidate; raw output retained in evidence')
   return d,run
  time.sleep(1)
 raise RuntimeError('Still running; retry the original saved request later')
if 'draftId' not in s:
 models=api('/api/ai-models?type=LANGUAGE');codes=[v['code'] for v in models if v['enabled']==1]
 s['model']='deepseek-flash' if 'deepseek-flash' in codes else codes[0]
 brief={'theme':'星光来信：虚构海边灯塔创意短片','audience':'青年观众','channel':'短视频','goal':'用一段温暖的虚构故事传递探索与互相回应的勇气','duration':30,'aspectRatio':'16:9','materials':'纯虚构科幻故事。守塔人小宁收到一封星际来信，用灯塔回应。不得写入真实景区、历史事实、票价或官方承诺。','sources':[]}
 d=api('/api/creation/drafts',{'requestId':s['createRequestId'],'brief':brief});s['draftId']=d['id'];save()
print(json.dumps({'draftId':s['draftId'],'model':s['model']},ensure_ascii=False),flush=True)
d=detail()
if not s.get('scriptConfirmed'):
 if not s.get('scriptAdopted'):
  d,run=request_run(d,'SCRIPT','scriptRequest');d=api(f"/api/creation/drafts/{d['id']}/runs/{run['id']}/adopt",{'revision':d['revision']});s['scriptAdopted']=True;save()
 if not s.get('scriptEdited'):
  d=api(f"/api/creation/drafts/{d['id']}",{'revision':d['revision'],'brief':d['body']['brief'],'script':d['body']['script']+'\n\n人工修改记录：结尾采用暖黄色灯光回应星际来信，保持纯虚构说明。','storyboard':d['body']['storyboard']},method='PUT');s['scriptEdited']=True;save()
 d=api(f"/api/creation/drafts/{d['id']}/confirm",{'revision':d['revision'],'stage':'SCRIPT'});s['scriptConfirmed']=True;save()
if not s.get('boardConfirmed'):
 if not s.get('boardAdopted'):
  d,run=request_run(d,'STORYBOARD','boardRequest');d=api(f"/api/creation/drafts/{d['id']}/runs/{run['id']}/adopt",{'revision':d['revision']});s['boardAdopted']=True;save()
 if not s.get('boardEdited'):
  board=d['body']['storyboard'];board['shots'][0]['visual']+='；人工调整：以暖黄色光源开场。'
  d=api(f"/api/creation/drafts/{d['id']}",{'revision':d['revision'],'brief':d['body']['brief'],'script':d['body']['script'],'storyboard':board},method='PUT');s['boardEdited']=True;save()
 d=api(f"/api/creation/drafts/{d['id']}/confirm",{'revision':d['revision'],'stage':'STORYBOARD'});s['boardConfirmed']=True;save()
if 'projectId' not in s:
 s['projectRequest']={'revision':d['revision'],'requestId':s['projectRequestId']};save()
 p=api(f"/api/creation/drafts/{d['id']}/project",s['projectRequest']);s['projectId']=p['projectId'];save()
p=api(f"/api/creation/drafts/{d['id']}/project",s['projectRequest']);assert p['projectId']==s['projectId']
shots=api(f"/api/projects/{s['projectId']}/shots");s['shots']=shots
assert len(shots)==len(d['body']['storyboard']['shots'])
assert any('人工调整' in v['scriptText'] for v in shots)
s['shotCount']=len(shots);s['assetCount']=len(d['body']['storyboard']['assets']);s['totalDuration']=sum(v['duration'] for v in d['body']['storyboard']['shots']);s['finalRevision']=d['revision']
token=json.loads((D/'chat-user-session.json').read_text())['token']
req=urllib.request.Request(f"http://127.0.0.1:18080/api/creation/drafts/{d['id']}/export",headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(req,timeout=30) as r:data=r.read()
(D/'文字剧本分镜真实联调.xlsx').write_bytes(data);s['excelBytes']=len(data);s['completedAt']=time.strftime('%Y-%m-%d %H:%M:%S %z');save()
print(json.dumps({k:s[k] for k in ['draftId','model','SCRIPTJobId','STORYBOARDJobId','projectId','shotCount','assetCount','totalDuration','finalRevision','excelBytes','completedAt']},ensure_ascii=False),flush=True)
