from pathlib import Path
import json,sys,uuid
from live_api import call
D=Path(__file__).parent;p=D/'controlled-workbench-evidence.json';s=json.loads(p.read_text())
def api(path,body=None,admin=False):
 r=call(path,body,admin=admin);assert r['code']==200,(path,r.get('code'),r.get('message'));return r['data']
base='/api/admin/workbench'
k=api(base+'/knowledge',{'revision':0,'title':'【验收记录】过期筛选用例（不用于创作）','content':'这是一条隔离环境的筛选验收用例，无文化或历史事实，不应用于创作。','sourceUrl':'https://example.org/','sourceOrganization':'本机功能验收','publishedOn':None,'summary':'过期筛选用例','factType':'FACT','topics':'验收用例','license':'团队验收文本，不含外部素材。','validUntil':'2020-01-01'},True)
k=api(base+f"/knowledge/{k['id']}/review",{'revision':k['revision'],'status':'APPROVED','reviewNote':'仅为过期过滤测试，不代表史料审核。'},True)
assert all(x['id']!=k['id'] for x in api('/api/workbench/knowledge?query='));s['expiredFactFiltered']=True
api(base+f"/knowledge/{k['id']}/review",{'revision':k['revision'],'status':'REJECTED','reviewNote':'测试结束；此条为过期筛选用例，不参与创作。'},True)
prompts=api(base+'/prompts',admin=True);current=next(x for x in prompts if x['stage']=='BRAINSTORM' and x['status']=='PUBLISHED')
api(base+f"/prompts/BRAINSTORM/{current['version']}/status",{'status':'DISABLED','expectedPublishedVersion':current['version']},True)
r=call('/api/brainstorms/1/runs',{'requestId':str(uuid.uuid4()),'revision':4,'model':'deepseek-flash'});assert r['code']!=200;s['disabledPromptRejected']=r['code']
new=api(base+'/prompts',{'stage':'BRAINSTORM','content':current['content'],'variables':current['variables'],'capability':'TEXT','changeNote':'停用关卡验收后，以新版本恢复已验证提示词。'},True)
api(base+f"/prompts/BRAINSTORM/{new['version']}/status",{'status':'PUBLISHED','expectedPublishedVersion':0},True);s['finalPublishedPromptVersion']=new['version']
r=call('/api/brainstorms/1/runs/2/adopt',{'revision':4});assert r['code']!=200;s['staleAdoptDenied']=r['code']
s['export']=api('/api/brainstorms/1/export');s['brainRun']=api('/api/brainstorms/1')['runs'][0];assert len(api('/api/brainstorms/1')['runs'])==2
s['knowledge']=next(x for x in api('/api/workbench/knowledge?query=') if x['id']==1);s['scriptResult']=next(x for x in api('/api/creation/drafts/7')['runs'] if x['id']==s['scriptRunId'])
p.write_text(json.dumps(s,ensure_ascii=False,indent=2))
print({k:s[k] for k in ['expiredFactFiltered','disabledPromptRejected','finalPublishedPromptVersion','staleAdoptDenied']})
