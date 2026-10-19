-- Separate from legacy browser-authored conversations_json; jobs retain their supplier audit.
CREATE TABLE toolbox_chat_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    INDEX idx_chat_sessions_owner (user_id, deleted_at, updated_at),
    CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE toolbox_chat_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    client_request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role VARCHAR(20) NOT NULL,
    type VARCHAR(10) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    model VARCHAR(100) NULL,
    job_id BIGINT NULL,
    status VARCHAR(20) NOT NULL,
    result_url VARCHAR(2048) NULL,
    error_message VARCHAR(1000) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_chat_request_role (session_id, client_request_id, role),
    INDEX idx_chat_messages_job (job_id),
    CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id) REFERENCES toolbox_chat_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_messages_job FOREIGN KEY (job_id) REFERENCES jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
