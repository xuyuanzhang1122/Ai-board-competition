CREATE TABLE workbench_prompt_executions (
 id VARCHAR(36) PRIMARY KEY,
 user_id BIGINT NULL,
 stage VARCHAR(40) NOT NULL,
 prompt_version INT NOT NULL,
 prompt_snapshot MEDIUMTEXT NOT NULL,
 input_snapshot MEDIUMTEXT NOT NULL,
 request_snapshot MEDIUMTEXT NOT NULL,
 status VARCHAR(24) NOT NULL,
 result_snapshot MEDIUMTEXT NULL,
 error VARCHAR(200) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TIMESTAMP NULL
);
