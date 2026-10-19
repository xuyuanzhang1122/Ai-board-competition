-- Audit of user-authorized unrestricted text calls. No monetary allowance or blocking state.
CREATE TABLE text_call_audits (
 id VARCHAR(36) PRIMARY KEY,
 user_id BIGINT NOT NULL,
 model_code VARCHAR(100) NOT NULL,
 status VARCHAR(32) NOT NULL,
 response_model VARCHAR(128),
 provider_request_id VARCHAR(256),
 input_tokens INT,
 output_tokens INT,
 total_tokens INT,
 review_reason VARCHAR(64),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 finished_at DATETIME(3)
);
CREATE INDEX idx_text_call_audit_user ON text_call_audits(user_id,created_at);
