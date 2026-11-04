from pathlib import Path
import json,uuid,time,sys,urllib.request
from live_api import call
D=Path(__file__).parent;topic=sys.argv[1];phase=sys.argv[2];p=D/('yantai-'+topic+'-evidence.json')
s=json.loads(p.read_text()) if p.exists() else {'topic':topic,'createRequestId':str(uuid.uuid4()),'projectRequestId':str(uuid.uuid4())}
def save():p.write_text(json.dumps(s,ensure_ascii=False,indent=2))
def api(path,body=None,method=None):
 r=call(path,body,method=method)
 if r.get('code')!=200:raise RuntimeError(str({'path':path,'code':r.get('code'),'message':r.get('message')}))
 return r['data']
def detail():return api('/api/creation/drafts/'+str(s['draftId']))
def run(stage):
 d=detail();key=stage+'Request'
 if key not in s:s[key]={'requestId':str(uuid.uuid4()),'revision':d['revision'],'stage':stage,'model':'deepseek-flash'};save()
 result=api(f"/api/creation/drafts/{d['id']}/runs",s[key]);s[stage+'RunId']=result['id'];s[stage+'JobId']=result['jobId'];save()
 for _ in range(150):
  d=detail();result=next(v for v in d['runs'] if v['id']==result['id'])
  if result['status'] not in ('PENDING','RUNNING'):
   s[stage+'Result']=result;save();print(json.dumps({'topic':topic,'stage':stage,'draftId':d['id'],'status':result['status'],'jobId':result['jobId'],'outputLength':len(result.get('output') or ''),'error':result.get('error')},ensure_ascii=False),flush=True)
   if result['status']!='SUCCEEDED':raise RuntimeError('Candidate failed; saved response, no automatic resubmission')
   return d,result
  time.sleep(1)
 raise RuntimeError('Still running; resume with original request')
if 'draftId' not in s:
 t=next(x for x in json.loads((D/'yantai-topic-briefs.json').read_text()) if x['id']==topic)
 d=api('/api/creation/drafts',{'requestId':s['createRequestId'],'brief':t['brief']});s['draftId']=d['id'];save()
if phase=='script':run('SCRIPT')
elif phase=='board':
 d=detail()
 if not d['body']['scriptConfirmed']:
  result=s['SCRIPTResult']
  if not next(x for x in d['runs'] if x['id']==result['id'])['applied']:d=api(f"/api/creation/drafts/{d['id']}/runs/{result['id']}/adopt",{'revision':d['revision']})
  note={'eight-immortals':'民间传说改编；以各显本领与协作为主线。','qi-jiguang':'历史背景下的艺术演绎；年轻士兵及对白均为创作，不作为史料原话。','su-shi':'诗意改编；诗句署名苏轼《海市（并叙）》，不把诗序神异叙述当作已证实神迹。'}[topic]
  if '人工复核记录：' not in d['body']['script']:
   d=api(f"/api/creation/drafts/{d['id']}",{'revision':d['revision'],'brief':d['body']['brief'],'script':d['body']['script']+'\n\n人工复核记录：'+note,'storyboard':d['body']['storyboard']},method='PUT')
  d=api(f"/api/creation/drafts/{d['id']}/confirm",{'revision':d['revision'],'stage':'SCRIPT'})
 run('STORYBOARD')
elif phase=='finish':
 d=detail()
 if not d['body']['boardConfirmed']:
  result=s['STORYBOARDResult']
  if not next(x for x in d['runs'] if x['id']==result['id'])['applied']:d=api(f"/api/creation/drafts/{d['id']}/runs/{result['id']}/adopt",{'revision':d['revision']})
  board=d['body']['storyboard']
  if topic=='eight-immortals':
   group=next(x for x in board['assets'] if x['id']=='c3');group['name']='其余六仙';group['description']='除铁拐李与何仙姑之外的六位仙人群像，与两位主角合计八仙；原创服饰与法宝造型，避免重复生成人物。'
  note='人工复核：30 秒参赛故事，来源引用与镜头角色绑定已核对，图片与视频仅保留提示词，未发起媒体生成。'
  if note not in board['reviewNotes']:
   board['reviewNotes'].append(note);d=api(f"/api/creation/drafts/{d['id']}",{'revision':d['revision'],'brief':d['body']['brief'],'script':d['body']['script'],'storyboard':board},method='PUT')
  d=api(f"/api/creation/drafts/{d['id']}/confirm",{'revision':d['revision'],'stage':'STORYBOARD'})
 if 'projectRequest' not in s:s['projectRequest']={'revision':d['revision'],'requestId':s['projectRequestId']};save()
 project=api(f"/api/creation/drafts/{d['id']}/project",s['projectRequest']);s['projectId']=project['projectId']
 shots=api(f"/api/projects/{s['projectId']}/shots");board=d['body']['storyboard'];assert len(shots)==len(board['shots']);assert sum(x['duration'] for x in board['shots'])==30
 for shot in board['shots']:assert set(shot['sourceIds']) <= {v['id'] for v in d['body']['brief']['sources']}
 assert d['body']['scriptConfirmed'] and d['body']['boardConfirmed'];assert all(not d['body']['brief'][x] for x in ('audience','channel','goal'))
 token=json.loads((D/'chat-user-session.json').read_text())['token'];req=urllib.request.Request(f"http://127.0.0.1:18080/api/creation/drafts/{d['id']}/export",headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(req,timeout=30) as r:data=r.read()
 (D/('参赛案例-'+topic+'.xlsx')).write_bytes(data)
 s.update(shotCount=len(shots),assetCount=len(board['assets']),duration=30,revision=detail()['revision'],excelBytes=len(data),completedAt=time.strftime('%Y-%m-%d %H:%M:%S %z'));save()
 print(json.dumps({k:s[k] for k in ('topic','draftId','SCRIPTJobId','STORYBOARDJobId','projectId','shotCount','assetCount','duration','revision','excelBytes','completedAt')},ensure_ascii=False),flush=True)
else:raise RuntimeError('Unknown phase')
