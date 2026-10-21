-- Upgrade only the untouched seeded default. Administrator-authored publications remain intact.
INSERT INTO workbench_prompts(stage,version,content,variables,capability,status,change_note)
SELECT s.stage,s.next_version,CONCAT(p.content,' 补充执行规则：只在evidence尚无知识检索结果时检索主题关键词。若evidence含INVALID，依据rejectedDecision修复最近失败决策，勿重新检索。BLOCKED、ERROR、UNAVAILABLE表示外部资料未取得，不重复请求相同资源，保留待核实说明并使用审核知识或请求补充。大纲保持简洁，每个方向3至5个节点，避免重复描述，完整闭合JSON括号。先save_draft保存中间大纲，再finish。'),p.variables,p.capability,'DRAFT','默认受控决策：修复上下文、外网阻断说明与中间大纲'
FROM workbench_prompt_stages s JOIN workbench_prompts p ON p.stage=s.stage AND p.version=s.published_version
WHERE s.stage='BRAINSTORM' AND p.change_note='受控工具决策及结构化大纲';
UPDATE workbench_prompts p JOIN workbench_prompt_stages s ON s.stage=p.stage
JOIN workbench_prompts n ON n.stage=s.stage AND n.version=s.next_version AND n.change_note='默认受控决策：修复上下文、外网阻断说明与中间大纲'
SET p.status='DISABLED' WHERE p.stage='BRAINSTORM' AND p.version=s.published_version;
UPDATE workbench_prompts p JOIN workbench_prompt_stages s ON s.stage=p.stage AND p.version=s.next_version
SET p.status='PUBLISHED' WHERE p.stage='BRAINSTORM' AND p.change_note='默认受控决策：修复上下文、外网阻断说明与中间大纲';
UPDATE workbench_prompt_stages s JOIN workbench_prompts p ON p.stage=s.stage AND p.version=s.next_version
SET s.published_version=s.next_version,s.next_version=s.next_version+1
WHERE s.stage='BRAINSTORM' AND p.status='PUBLISHED' AND p.change_note='默认受控决策：修复上下文、外网阻断说明与中间大纲';
