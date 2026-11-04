from pathlib import Path
import subprocess,os,signal,time,shutil,sys
r=Path(__file__).resolve().parents[2];d=r/'credentials/runtime';pid=int((d/'backend.pid').read_text().strip())
cmd=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
if str(d/'application.jar') not in cmd:raise SystemExit('backend PID does not match managed runtime')
os.kill(pid,signal.SIGTERM)
for _ in range(40):
 if subprocess.run(['ps','-p',str(pid)],capture_output=True).returncode!=0:break
 time.sleep(.5)
else:raise SystemExit('backend still stopping; artifact preserved')
jar=next((r/'backend/target').glob('*SNAPSHOT.jar'));shutil.copy2(jar,d/'application.jar')
java=next((r/'.superpowers/tools').glob('jdk-*/Contents/Home/bin/java'))
with (d/'backend.log').open('a') as out:
 p=subprocess.Popen([str(java),'-jar',str(d/'application.jar'),'--spring.config.location=file:'+str(d/'application.properties')],cwd=r/'backend',env=dict(os.environ,APP_DOTENV_ENABLED='false'),stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
(d/'backend.pid').write_text(str(p.pid));os.chmod(d/'backend.pid',0o600)
sys.path.insert(0,str(d));from live_api import call
for _ in range(40):
 try:
  response=call('/api/ai-models?type=LANGUAGE')
  if response.get('code')==200:print({'backendReady':True,'languageModels':len(response.get('data') or [])});break
 except Exception:pass
 if p.poll() is not None:raise SystemExit('backend exited; inspect private startup log')
 time.sleep(.5)
else:raise SystemExit('backend not ready yet')
