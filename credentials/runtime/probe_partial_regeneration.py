from pathlib import Path
import json,uuid,sys,urllib.request,urllib.error,copy,os
from live_api import call
D=Path(__file__).parent;p=D/'partial-regeneration-evidence.json';s=json.loads(p.read_text()) if p.exists() else {}
def save():p.write_text(json.dumps(s,ensure_ascii=False,indent=2))
def api(path,body=None,admin=False,method=None):
 r=call(path,body,admin=admin,method=method)
 if r.get('code')!=200:raise RuntimeError(str({'path':path,'code':r.get('code'),'message':r.get('message')}))
 return r['data']
def reject(path,body):
 r=call(path,body);assert r['code']!=200;return r['code']
phase=sys.argv[1]
if phase=='login':
 props=dict(l.split('=',1) for l in (D/'application.properties').read_text().splitlines() if '=' in l and not l.startswith('#'))
 for name,path in [('chat-user-session','/api/auth/login'),('admin-session','/api/admin/auth/login'),('isolation-user-session','/api/auth/login')]:
  f=D/(name+'.json');saved=json.loads(f.read_text());payload={k:saved[k] for k in ['username','password']} if name!='admin-session' else {'username':props['admin.username'],'password':props['admin.password']}
  req=urllib.request.Request('http://127.0.0.1:18080'+path,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req) as res:r=json.load(res)
  assert r['code']==200;saved['token']=r['data']['token'];f.write_text(json.dumps(saved));os.chmod(f,0o600)
 print({'sessionsRefreshed':True})
elif phase=='init':
 root='/api/creation/drafts'
 if 'draftId' not in s:
  prior=api(root+'/1');b=prior['body'];s['createRequest']={'requestId':str(uuid.uuid4()),'brief':dict(b['brief'],theme='局部重生成真实验收：虚构灯塔与彼此照应')};save()
  d=api(root,s['createRequest']);s['draftId']=d['id'];s['baseScript']=b['script'];s['fixtureBoard']=copy.deepcopy(b['storyboard']);s['fixtureBoard']['shots'][1]['visual']+='；人工保留镜头：以暖色灯光展现彼此照应，局部生成不得覆盖。';save()
 d=api(root+'/'+str(s['draftId']));url=root+'/'+str(d['id'])
 if not d['body']['scriptConfirmed']:
  d=api(url,{'revision':d['revision'],'brief':d['body']['brief'],'script':s['baseScript'],'storyboard':s['fixtureBoard']},method='PUT')
  d=api(url+'/confirm',{'revision':d['revision'],'stage':'SCRIPT'})
 if not d['body']['boardConfirmed']:d=api(url+'/confirm',{'revision':d['revision'],'stage':'STORYBOARD'})
 target=d['body']['storyboard']['shots'][0]['id'];locked=d['body']['storyboard']['shots'][1]['id']
 d=api(url+'/shot-locks',{'revision':d['revision'],'lockedShotIds':[locked]},method='PUT')
 s['before']=copy.deepcopy(d);s['target']=target;s['locked']=locked
 models=api('/api/ai-models?type=LANGUAGE');codes=[v['code'] for v in models if v['enabled']==1];model='deepseek-flash' if 'deepseek-flash' in codes else codes[0]
 s['partialRequest']={'requestId':str(uuid.uuid4()),'revision':d['revision'],'model':model,'shotIds':[target],'lockedShotIds':[locked],'instruction':'只将所选镜头的画面改成海浪远景中的灯塔轮廓，在画面描述中加入“海浪远景”。保留角色、场景、道具引用及原有时长。其余人工镜头保持原样。'};save()
 bad=dict(s['partialRequest'],requestId=str(uuid.uuid4()),shotIds=[locked]);s['lockedTargetRejected']=reject(url+'/partial-runs',bad)
 run=api(url+'/partial-runs',s['partialRequest']);assert api(url+'/partial-runs',s['partialRequest'])['id']==run['id'];s['runId']=run['id'];s['jobId']=run['jobId'];save()
 print({'draftId':d['id'],'inputRevision':d['revision'],'runId':run['id'],'jobId':run['jobId'],'lockedTargetRejected':s['lockedTargetRejected'],'idempotentSubmission':True})
elif phase=='status':
 d=api('/api/creation/drafts/'+str(s['draftId']));r=next(x for x in d['runs'] if x['id']==s['runId']);s['run']=r;save();print({'status':r['status'],'outputLength':len(r.get('output') or ''),'error':r.get('error'),'draftId':d['id'],'jobId':r['jobId']})
elif phase=='adopt':
 url='/api/creation/drafts/'+str(s['draftId']);d=api(url);r=next(x for x in d['runs'] if x['id']==s['runId']);assert r['status']=='SUCCEEDED'
 d=api(url+f"/runs/{r['id']}/adopt",{'revision':d['revision']});old=s['before']['body']['storyboard'];new=d['body']['storyboard'];assert new['assets']==old['assets'];assert new['shots'][1:]==old['shots'][1:];assert new['shots'][0]['duration']==old['shots'][0]['duration'];assert '海浪远景' in new['shots'][0]['visual'];# Confirmation was also verified through the browser before this idempotent API read.
 assert d['lockedShotIds']==[s['locked']]
 d=api(url+'/confirm',{'revision':d['revision'],'stage':'STORYBOARD'});s['after']=d;s['evidence']=api(url+'/evidence');assert any(x['stage']=='STORYBOARD_PARTIAL' for x in s['evidence']['inputs']);s['preservedUnselectedShots']=len(new['shots'])-1;save()
 token=json.loads((D/'chat-user-session.json').read_text())['token'];req=urllib.request.Request('http://127.0.0.1:18080'+url+'/export',headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(req) as response:data=response.read()
 (D/'局部重生成真实验收.xlsx').write_bytes(data);s['excelBytes']=len(data);(D/'局部重生成完整过程.json').write_text(json.dumps(s['evidence'],ensure_ascii=False,indent=2));save()
 print({'draftId':d['id'],'revision':d['revision'],'changedShot':s['target'],'lockedShot':s['locked'],'unselectedShotsPreserved':s['preservedUnselectedShots'],'excelBytes':len(data),'confirmed':d['body']['boardConfirmed']})
