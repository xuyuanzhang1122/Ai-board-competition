package com.ym.ai_story_studio_server.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.entity.Admin;
import com.ym.ai_story_studio_server.mapper.AdminMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 启动时初始化首个管理员
 *
 * <p>读取 {@link AdminProperties}（来自 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_DISPLAY_NAME），
 * 若用户名不存在则创建，存在则更新密码哈希与显示名。未配置用户名或密码则跳过。
 * 不在迁移中硬编码默认密码。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AdminInitializer implements ApplicationRunner {

    private final AdminProperties adminProperties;
    private final AdminMapper adminMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(ApplicationArguments args) {
        // String username = "admin";
        // String password = "admin123";
        String username = adminProperties.getUsername();
        String password = adminProperties.getPassword();

        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            log.info("[AdminInitializer] 未配置 ADMIN_USERNAME / ADMIN_PASSWORD，跳过管理员初始化");
            return;
        }

        String hash = passwordEncoder.encode(password);
        Admin existing = adminMapper.selectOne(
                new LambdaQueryWrapper<Admin>().eq(Admin::getUsername, username)
        );

        if (existing == null) {
            Admin admin = new Admin();
            admin.setUsername(username);
            admin.setPasswordHash(hash);
            admin.setDisplayName(StringUtils.hasText(adminProperties.getDisplayName())
                    ? adminProperties.getDisplayName() : username);
            admin.setStatus(1);
            adminMapper.insert(admin);
            log.info("[AdminInitializer] 已创建初始管理员: username={}", username);
        } else {
            existing.setPasswordHash(hash);
            existing.setDisplayName(StringUtils.hasText(adminProperties.getDisplayName())
                    ? adminProperties.getDisplayName() : existing.getDisplayName());
            existing.setStatus(1);
            adminMapper.updateById(existing);
            log.info("[AdminInitializer] 已更新管理员密码 / 信息: username={}", username);
        }
    }
}
