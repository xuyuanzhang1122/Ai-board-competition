package com.ym.ai_story_studio_server.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 初始管理员配置
 *
 * <p>从 application.yml / .env 绑定，用于启动时创建或更新首个管理员。
 * 不在数据库迁移中硬编码默认密码。
 *
 * <pre>
 * admin:
 *   username: ${ADMIN_USERNAME:}
 *   password: ${ADMIN_PASSWORD:}
 *   display-name: ${ADMIN_DISPLAY_NAME:超级管理员}
 * </pre>
 */
@Data
@Component
@ConfigurationProperties(prefix = "admin")
public class AdminProperties {

    /**
     * 初始管理员用户名，为空则跳过初始化
     */
    private String username;

    /**
     * 初始管理员密码（明文，启动时哈希），为空则跳过初始化
     */
    private String password;

    /**
     * 初始管理员显示名
     */
    private String displayName = "超级管理员";
}
