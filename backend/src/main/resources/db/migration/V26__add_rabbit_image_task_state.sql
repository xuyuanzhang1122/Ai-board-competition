-- RabbitMQ 按“一次上游生图”粒度调度时的持久化状态。
-- JobItem 仍是前端展示的“一个分镜”，本表则记录 countPerItem 展开后的每次上游任务。
CREATE TABLE image_generation_tasks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '图片生成调度任务ID',
    job_id BIGINT NOT NULL COMMENT '父Job ID',
    job_item_id BIGINT NOT NULL COMMENT '分镜JobItem ID',
    user_id BIGINT NOT NULL COMMENT '发起用户',
    project_id BIGINT NOT NULL COMMENT '项目ID',
    shot_id BIGINT NOT NULL COMMENT '分镜ID',
    task_index INT NOT NULL COMMENT '同一分镜中的生成序号',
    provider_task_id VARCHAR(128) NULL COMMENT '上游异步任务ID',
    status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTING'
        COMMENT 'SUBMITTING/SUBMITTED/POLLING/COMPLETING/SUCCEEDED/FAILED/CANCELED',
    poll_count INT NOT NULL DEFAULT 0 COMMENT '已轮询次数',
    query_failure_count INT NOT NULL DEFAULT 0 COMMENT '连续查询失败次数',
    prompt MEDIUMTEXT NULL COMMENT '生图提示词',
    model VARCHAR(128) NULL COMMENT '模型',
    aspect_ratio VARCHAR(16) NULL COMMENT '画幅比例',
    result_url VARCHAR(1024) NULL COMMENT '本地持久化后的结果URL',
    error_message TEXT NULL COMMENT '失败原因',
    lease_until DATETIME(3) NULL COMMENT '提交/收尾阶段的短租约，崩溃后可抢占',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    finished_at DATETIME(3) NULL,
    UNIQUE KEY uk_image_task_item_index (job_item_id, task_index),
    UNIQUE KEY uk_image_task_provider (provider_task_id),
    KEY idx_image_task_status_lease (status, lease_until),
    KEY idx_image_task_job (job_id),
    CONSTRAINT fk_image_task_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_image_task_item FOREIGN KEY (job_item_id) REFERENCES job_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='图片上游任务持久化调度表';

-- Rabbit 是 at-least-once；用上游 taskId 给资产落库加幂等键，避免重投时重复建资产。
ALTER TABLE asset_versions
    ADD COLUMN source_task_id VARCHAR(128) NULL COMMENT '产生该资产的上游任务ID' AFTER params_json,
    ADD UNIQUE KEY uk_asset_version_source_task (source_task_id);
