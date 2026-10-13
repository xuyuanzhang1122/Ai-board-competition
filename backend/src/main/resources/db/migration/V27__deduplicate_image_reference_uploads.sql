-- 同一批图片生成任务中的本地参考图只允许上传 GeekNow OSS 一次。
CREATE TABLE image_reference_uploads (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    job_id BIGINT NOT NULL,
    source_url_hash CHAR(64) NOT NULL,
    source_url VARCHAR(1024) NOT NULL,
    public_url VARCHAR(2048) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'UPLOADING'
        COMMENT 'UPLOADING/SUCCEEDED/FAILED',
    error_message TEXT NULL,
    lease_until DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_image_reference_job_source (job_id, source_url_hash),
    KEY idx_image_reference_status_lease (status, lease_until),
    CONSTRAINT fk_image_reference_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批量生图参考图上传幂等缓存';
