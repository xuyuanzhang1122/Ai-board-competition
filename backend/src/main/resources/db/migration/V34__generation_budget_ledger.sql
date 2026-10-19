-- One shared competition budget. New providers stay disabled in application configuration.
CREATE TABLE generation_budget_accounts (
    id BIGINT PRIMARY KEY,
    limit_cny DECIMAL(18,6) NOT NULL,
    reserved_cny DECIMAL(18,6) NOT NULL DEFAULT 0,
    blocked_reason VARCHAR(64),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT ck_generation_budget_capacity CHECK (limit_cny >= 0 AND reserved_cny >= 0 AND reserved_cny <= limit_cny)
);

INSERT INTO generation_budget_accounts (id, limit_cny, reserved_cny) VALUES (1, 20.000000, 0);

CREATE TABLE generation_budget_reservations (
    id VARCHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    model_code VARCHAR(100) NOT NULL,
    status VARCHAR(32) NOT NULL,
    ceiling_cny DECIMAL(18,6) NOT NULL,
    quote_revision VARCHAR(128) NOT NULL,
    quote_verified_at VARCHAR(40) NOT NULL,
    quote_reference VARCHAR(512) NOT NULL,
    expected_response_model VARCHAR(128) NOT NULL,
    input_token_limit BIGINT NOT NULL,
    output_token_limit INT NOT NULL,
    input_cny_per_million DECIMAL(18,6) NOT NULL,
    output_cny_per_million DECIMAL(18,6) NOT NULL,
    response_model VARCHAR(128),
    provider_request_id VARCHAR(256),
    input_tokens INT,
    output_tokens INT,
    total_tokens INT,
    actual_cost_cny DECIMAL(18,6),
    review_reason VARCHAR(64),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at DATETIME(3),
    CONSTRAINT ck_generation_budget_reservation CHECK (ceiling_cny > 0),
    CONSTRAINT ck_generation_budget_status CHECK (status IN ('RESERVED', 'SUCCEEDED', 'REVIEW_REQUIRED'))
);

CREATE INDEX idx_generation_budget_review ON generation_budget_reservations (status, created_at);
