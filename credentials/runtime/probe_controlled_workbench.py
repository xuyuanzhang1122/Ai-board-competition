from pathlib import Path
import json,uuid,sys,urllib.request,time,copy
from live_api import call
D=Path(__file__).parent;p=D/'controlled-workbench-evidence.json';s=json.loads(p.read_text()) if p.exists() else {}
def save():p.write_text(json.dumps(s,ensure_ascii=False,indent=2))
def api(path,body=None,admin=False,method=None):
 r=call(path,body,admin=admin,method=method)
 if r.get('code')!=200:raise RuntimeError(str({'path':path,'code':r.get('code'),'message':r.get('message')}))
 return r['data']
def rejected(path,body=None,method=None):
 r=call(path,body,method=method);assert r.get('code')!=200;return r.get('code')
phase=sys.argv[1]
if phase=='library':
 base='/api/admin/workbench'
 topics=json.loads((D/'yantai-topic-briefs.json').read_text());brief=next(v['brief'] for v in topics if v['id']=='eight-immortals')
 source=brief['sources'][0]
 k=api(base+'/knowledge',{'revision':0,'title':'八仙过海 · 传说与参赛改编边界','content':'八仙过海是民间传说题材。创作以各显本领与协作展开，神话人物、法宝和海上奇观应标注为传说或艺术演绎，不作为真实历史事件。不得编造景区票价、开放安排或官方承诺。','sourceUrl':source['url'],'sourceOrganization':'蓬莱公开文旅资料（参见原始链接）','publishedOn':None,'summary':'民间传说与艺术演绎边界，非真实历史事件。','factType':'LEGEND','topics':'烟台,蓬莱,八仙过海','license':'团队原创摘要；原网页仅作资料引用，图像、商标及改编素材授权需另行核实。','validUntil':None},admin=True)
 assert all(x['id']!=k['id'] for x in api('/api/workbench/knowledge?query='))
 approved=api(base+f"/knowledge/{k['id']}/review",{'revision':k['revision'],'status':'APPROVED','reviewNote':'参赛隔离环境来源结构及传说标记复核；不构成对神话事件的史实认定，不包含图像授权。'},admin=True)
 assert any(x['id']==k['id'] for x in api('/api/workbench/knowledge?query='))
 fields=['title','content','sourceUrl','sourceOrganization','publishedOn','summary','factType','topics','license','validUntil'];edit={f:approved[f] for f in fields};edit.update(revision=approved['revision'],summary='已复核传说分类；编辑后必须重新审核。')
 edited=api(base+f"/knowledge/{k['id']}",edit,admin=True,method='PUT');assert edited['status']=='DRAFT'
 assert all(x['id']!=k['id'] for x in api('/api/workbench/knowledge?query='))
 stale=call(base+f"/knowledge/{k['id']}/review",{'revision':approved['revision'],'status':'APPROVED','reviewNote':'stale'},admin=True);assert stale['code']!=200
 k=api(base+f"/knowledge/{k['id']}/review",{'revision':edited['revision'],'status':'APPROVED','reviewNote':'重新核对团队原创摘要及LEGEND分类；不含素材授权。'},admin=True)
 s['knowledge']=k;s['knowledgeEditInvalidates']=True;s['staleReviewCode']=stale['code'];s['userAdminReadDenied']=rejected(base+'/prompts')
 prompts=api(base+'/prompts',admin=True);old=next(x for x in prompts if x['stage']=='BRAINSTORM' and x['status']=='PUBLISHED')
 content=old['content']+' 若当前运行evidence尚无search_knowledge结果，先检索主题知识。用户明确要求外网查阅时，web_search后从返回结果选一页read_page；外部结果只保留待核实线索，不可作为已审核引用。输出前validate_sources核验所用知识ID。先save_draft保存2–3个完整候选，再finish，避免重复检索已有证据。'
 draft=api(base+'/prompts',{'stage':'BRAINSTORM','content':content,'variables':'brief,sources,evidence','capability':'TEXT','changeNote':'补充按需外网检索、已有证据复用和中间大纲保存规则'},admin=True)
 bad=call(base+f"/prompts/BRAINSTORM/{draft['version']}/status",{'status':'PUBLISHED','expectedPublishedVersion':0},admin=True);assert bad['code']!=200
 pub=api(base+f"/prompts/BRAINSTORM/{draft['version']}/status",{'status':'PUBLISHED','expectedPublishedVersion':old['version']},admin=True);s['publishedPromptVersion']=pub['version'];s['stalePublishCode']=bad['code'];s['oldPromptContentUnchanged']=next(x for x in api(base+'/prompts',admin=True) if x['stage']=='BRAINSTORM' and x['version']==old['version'])['content']==old['content'];save()
 print(json.dumps({'knowledgeId':k['id'],'revision':k['revision'],'promptVersion':pub['version'],'editInvalidates':True,'staleReviewCode':stale['code'],'stalePublishCode':bad['code'],'userAdminDenied':s['userAdminReadDenied']},ensure_ascii=False))
elif phase=='brain':
 brief={'theme':'八仙过海：各显本领也要彼此照应','audience':'','channel':'','goal':'','duration':30,'aspectRatio':'16:9','materials':'民间传说改编，生成两个不同切入点供人工选择。请检索审核知识，并通过网页搜索找到一个公开页面后读取，作为待核实线索，不把外网页面当已审核来源。不使用景区票价、营业时间或其他现实承诺。','sources':[]}
 if 'createRequest' not in s:s['createRequest']={'requestId':str(uuid.uuid4()),'brief':brief};save()
 d=api('/api/brainstorms',s['createRequest']);s['brainstormId']=d['id'];assert api('/api/brainstorms',s['createRequest'])['id']==d['id']
 if 'brainRequest' not in s:s['brainRequest']={'requestId':str(uuid.uuid4()),'revision':d['revision'],'model':'deepseek-flash'};save()
 run=api(f"/api/brainstorms/{d['id']}/runs",s['brainRequest']);s['brainRunId']=run['id'];save()
 assert api(f"/api/brainstorms/{d['id']}/runs",s['brainRequest'])['id']==run['id']
 print(json.dumps({'brainstormId':d['id'],'runId':run['id'],'model':run['model'],'promptVersion':run['promptVersion'],'idempotentCreateAndRun':True},ensure_ascii=False))
elif phase=='status':
 d=api(f"/api/brainstorms/{s['brainstormId']}");run=next(x for x in d['runs'] if x['id']==s['brainRunId']);s['brainRun']=run;save();print(json.dumps({'id':d['id'],'status':run['status'],'error':run['error'],'tools':[(x['tool'],x['status']) for x in run['steps']],'directions':len((run.get('output') or {}).get('directions',[]))},ensure_ascii=False))
elif phase=='finish':
 root=f"/api/brainstorms/{s['brainstormId']}";d=api(root);run=next(x for x in d['runs'] if x['id']==s['brainRunId']);assert run['status']=='SUCCEEDED'
 if not d['outline']:d=api(root+f"/runs/{run['id']}/adopt",{'revision':d['revision']})
 outline=d['outline'];outline['selectedId']=outline['directions'][0]['id'];outline['selectionReason']='人工选择：以协作为主线更适合30秒参赛短片；另一个方向留作后续扩展。';outline['directions'][0]['beats'].append('人工修订：片尾明确标注民间传说改编，镜头停在八人相互照应。')
 d=api(root,{'revision':d['revision'],'brief':d['brief'],'outline':outline},method='PUT');assert not d['confirmed']
 d=api(root+'/confirm',{'revision':d['revision']});assert d['confirmed']
 if 'handoffRequest' not in s:s['handoffRequest']={'revision':d['revision'],'requestId':str(uuid.uuid4())};save()
 target=api(root+'/creation',s['handoffRequest']);assert api(root+'/creation',s['handoffRequest'])==target
 c=api('/api/creation/drafts/'+str(target['draftId']));assert outline['directions'][0]['title'] in c['body']['brief']['materials'];assert '人工修订' in c['body']['brief']['materials'];s['creationDraftId']=c['id'];s['handoffIdempotent']=True
 s['export']=api(root+'/export');assert s['export']['handoffSnapshot'];save()
 token=json.loads((D/'isolation-user-session.json').read_text())['token'];req=urllib.request.Request('http://127.0.0.1:18080'+root,headers={'Authorization':'Bearer '+token})
 try:
  with urllib.request.urlopen(req) as response:foreign=json.load(response)
 except urllib.error.HTTPError as e:foreign=json.load(e)
 assert foreign.get('code')!=200;s['crossUserDenied']=foreign['code'];save()
 if 'scriptRequest' not in s:s['scriptRequest']={'requestId':str(uuid.uuid4()),'revision':c['revision'],'stage':'SCRIPT','model':'deepseek-flash'};save()
 script=api(f"/api/creation/drafts/{c['id']}/runs",s['scriptRequest']);s['scriptRunId']=script['id'];s['scriptJobId']=script['jobId'];save()
 print(json.dumps({'brainstormId':d['id'],'confirmedRevision':d['revision'],'creationDraftId':c['id'],'handoffIdempotent':True,'crossUserDenied':foreign['code'],'scriptJobId':script['jobId'],'scriptStatus':script['status']},ensure_ascii=False))
elif phase=='script':
 root=f"/api/creation/drafts/{s['creationDraftId']}";d=api(root);run=next(x for x in d['runs'] if x['id']==s['scriptRunId']);s['scriptResult']=run
 if run['status']=='SUCCEEDED' and not run['applied']:d=api(root+f"/runs/{run['id']}/adopt",{'revision':d['revision']})
 save();print(json.dumps({'creationDraftId':d['id'],'status':run['status'],'scriptJobId':run['jobId'],'scriptLength':len(run.get('output') or ''),'error':run.get('error'),'script':d['body']['script'][:140]},ensure_ascii=False))
