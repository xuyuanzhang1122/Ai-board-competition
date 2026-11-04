from pathlib import Path
import subprocess
migration=Path('backend/src/main/resources/db/migration/V44__refine_default_brainstorm_prompt.sql').read_text().replace('workbench_prompt_stages','wb_v44_test_stages').replace('workbench_prompts','wb_v44_test_prompts')
sql='''DROP TABLE IF EXISTS wb_v44_test_prompts;
DROP TABLE IF EXISTS wb_v44_test_stages;
CREATE TABLE wb_v44_test_stages LIKE workbench_prompt_stages;
CREATE TABLE wb_v44_test_prompts LIKE workbench_prompts;
INSERT INTO wb_v44_test_stages VALUES('BRAINSTORM',1,2);
INSERT INTO wb_v44_test_prompts(stage,version,content,variables,capability,status,change_note) VALUES('BRAINSTORM',1,'original template','brief,sources,evidence','TEXT','PUBLISHED','受控工具决策及结构化大纲');
'''+migration+'''
SELECT CONCAT('default=',published_version,',next=',next_version) FROM wb_v44_test_stages;
SELECT CONCAT(version,':',status,':',IF(version=1,content,IF(LOCATE('rejectedDecision',content)>0,'refined','missing'))) FROM wb_v44_test_prompts ORDER BY version;
UPDATE wb_v44_test_prompts SET change_note='custom administrator version' WHERE version=2;
'''+migration+'''
SELECT CONCAT('custom_preserved=',published_version,',count=',(SELECT COUNT(*) FROM wb_v44_test_prompts)) FROM wb_v44_test_stages;
DROP TABLE wb_v44_test_prompts;
DROP TABLE wb_v44_test_stages;
'''
r=subprocess.run(['docker','exec','-i','ai-board-competition-dev-mysql-1','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" ai_board_competition --batch --skip-column-names'],input=sql,text=True,capture_output=True)
print(r.stdout)
if r.returncode:print(r.stderr[:500]);raise SystemExit(r.returncode)
assert 'default=2,next=3' in r.stdout and '1:DISABLED:original template' in r.stdout and '2:PUBLISHED:refined' in r.stdout and 'custom_preserved=2,count=2' in r.stdout
print({'defaultUpgradeAndCustomVersionPreservation':True})
