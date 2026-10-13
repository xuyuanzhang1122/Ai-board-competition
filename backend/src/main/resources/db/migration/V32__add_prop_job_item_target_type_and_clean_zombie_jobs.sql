-- 修复：批量生成道具画像时 createJobItems 写入 target_type='PPROP'，
-- 但 V4 的 chk_job_items_target_type 约束漏了道具类型，导致 INSERT 违反约束、
-- 整个生成请求 500，且因方法非事务，Job 已落库却无子项、从未派发 →
-- 前端 resumeActiveJobs 会把这些 RUNNING/PENDING 僵尸任务反复复活成"转圈死任务"。

-- 1. 约束补上道具类型（LIB_PROP 项目道具库、PPROP 项目道具绑定）。
ALTER TABLE job_items DROP CHECK chk_job_items_target_type;
ALTER TABLE job_items
    ADD CONSTRAINT chk_job_items_target_type
    CHECK (target_type IN ('LIB_CHAR', 'PCHAR', 'LIB_SCENE', 'PSCENE', 'LIB_PROP', 'PPROP', 'SHOT', 'PROJECT'));

-- 2. 清理已产生的僵尸任务：仅针对本应有子项的生成类任务但实际无子项者
--    （PARSE_TEXT / EXPORT 等本就无子项，不在清理范围内）。
UPDATE jobs
SET status = 'FAILED',
    error_message = COALESCE(error_message, '任务创建未完成（无子项，已由 V32 清理）'),
    finished_at = NOW(3)
WHERE status IN ('PENDING', 'RUNNING')
  AND job_type IN (
        'BATCH_GEN_CHAR_IMG', 'BATCH_GEN_SCENE_IMG', 'BATCH_GEN_PROP_IMG',
        'BATCH_GEN_SHOT_IMG', 'BATCH_GEN_VIDEO', 'SINGLE_SHOT_IMAGE', 'SINGLE_SHOT_VIDEO'
      )
  AND id NOT IN (SELECT DISTINCT job_id FROM job_items);
