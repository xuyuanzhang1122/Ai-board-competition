from pathlib import Path
import json,os,subprocess,datetime
root=Path(__file__).resolve().parents[3]
container='ai-board-competition-dev-mysql-1'
metadata=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
password=next(v.split('=',1)[1] for v in metadata['Config']['Env'] if v.startswith('MYSQL_ROOT_PASSWORD='))
name='ai_board_competition_task1_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
subprocess.run(['docker','exec','-i',container,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot'],input=f'CREATE DATABASE {name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',text=True,check=True)
jdk=next((root/'.superpowers/tools').glob('jdk-*/Contents/Home'))
jars=[str(root/'backend/target/classes')]+[str(p) for p in (root/'.superpowers/m2').rglob('*.jar')]
env=dict(os.environ,TASK1_DB_URL=f'jdbc:mysql://127.0.0.1:13307/{name}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false',TASK1_DB_PASSWORD=password)
log=Path(__file__).with_name('task1-mysql.log')
with log.open('w') as output:
 result=subprocess.run([str(jdk/'bin/java'),'-cp',os.pathsep.join(jars),str(Path(__file__).with_name('Task1Migration.java')),str(root)],env=env,stdout=output,stderr=subprocess.STDOUT)
print('Isolated schema:',name)
print('\n'.join(log.read_text().splitlines()[-12:]))
raise SystemExit(result.returncode)
