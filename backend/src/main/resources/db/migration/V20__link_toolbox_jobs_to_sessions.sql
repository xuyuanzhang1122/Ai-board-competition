SET NAMES utf8mb4;

ALTER TABLE jobs
    ADD COLUMN toolbox_session_id BIGINT NULL COMMENT '所属工具箱会话ID' AFTER project_id,
    ADD COLUMN toolbox_deleted_at DATETIME NULL COMMENT '工具箱历史删除时间' AFTER toolbox_session_id,
    ADD INDEX idx_jobs_toolbox_history (user_id, toolbox_session_id, toolbox_deleted_at, created_at),
    ADD CONSTRAINT fk_jobs_toolbox_session
        FOREIGN KEY (toolbox_session_id) REFERENCES toolbox_sessions(id) ON DELETE SET NULL;
