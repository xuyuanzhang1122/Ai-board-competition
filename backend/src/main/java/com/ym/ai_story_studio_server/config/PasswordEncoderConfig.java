package com.ym.ai_story_studio_server.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 密码编码器配置
 *
 * <p>仅引入 spring-security-crypto 的 BCrypt 实现，不启用完整 Spring Security 过滤链。
 * 用于普通用户 USERNAME 登录与管理员登录的密码哈希 / 校验。
 */
@Configuration
public class PasswordEncoderConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
