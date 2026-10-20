CREATE TABLE brainstorm_drafts (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 user_id BIGINT NOT NULL,
 request_id VARCHAR(80) NOT NULL,
 request_json MEDIUMTEXT NOT NULL,
 revision BIGINT NOT NULL DEFAULT 1,
 brief_json MEDIUMTEXT NOT NULL,
 outline_json MEDIUMTEXT NULL,
 confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 creation_draft_id BIGINT NULL,
 handoff_request_id VARCHAR(80) NULL,
 handoff_snapshot MEDIUMTEXT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE(user_id,request_id)
);
CREATE TABLE brainstorm_runs (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 draft_id BIGINT NOT NULL,
 request_id VARCHAR(80) NOT NULL,
 input_revision BIGINT NOT NULL,
 model VARCHAR(128) NOT NULL,
 prompt_version INT NOT NULL,
 prompt_content MEDIUMTEXT NOT NULL,
 input_json MEDIUMTEXT NOT NULL,
 sources_json MEDIUMTEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
 job_id BIGINT NULL,
 tool_count INT NOT NULL DEFAULT 0,
 page_count INT NOT NULL DEFAULT 0,
 repairs INT NOT NULL DEFAULT 0,
 output_json MEDIUMTEXT NULL,
 error_message TEXT NULL,
 applied BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(draft_id,request_id),
 FOREIGN KEY(draft_id) REFERENCES brainstorm_drafts(id)
);
CREATE TABLE brainstorm_steps (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 run_id BIGINT NOT NULL,
 job_id BIGINT NULL,
 tool VARCHAR(32) NOT NULL,
 status VARCHAR(24) NOT NULL,
 input_summary MEDIUMTEXT NOT NULL,
 result_json MEDIUMTEXT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(run_id) REFERENCES brainstorm_runs(id)
);
