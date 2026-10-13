SET NAMES utf8mb4;

ALTER TABLE toolbox_sessions
    DROP FOREIGN KEY fk_toolbox_sessions_user;

ALTER TABLE toolbox_sessions
    ADD CONSTRAINT fk_toolbox_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE;
