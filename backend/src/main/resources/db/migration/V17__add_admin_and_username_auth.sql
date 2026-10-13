-- V17: 新增 admins 表，支持 USERNAME 认证类型

CREATE TABLE IF NOT EXISTS admins (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '管理员ID',
    username      VARCHAR(64)  NOT NULL                COMMENT '用户名（登录名）',
    password_hash VARCHAR(255) NOT NULL                COMMENT 'BCrypt 密码哈希',
    display_name  VARCHAR(64)  NOT NULL DEFAULT ''     COMMENT '显示名称',
    status        TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1正常 0禁用',
    last_login_at DATETIME                             COMMENT '最后登录时间',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员账号表';

-- user_auth 的 auth_type 枚举扩展为 PHONE/EMAIL/WECHAT/USERNAME
-- MySQL VARCHAR 字段无需额外 DDL，直接插入 USERNAME 类型记录即可
-- 在此添加一个注释以记录扩展说明
ALTER TABLE user_auth COMMENT = '用户认证表（auth_type: PHONE/EMAIL/WECHAT/USERNAME）';
