package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.admin.AdminInfoVO;
import com.ym.ai_story_studio_server.entity.Admin;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AdminMapper;
import com.ym.ai_story_studio_server.service.AdminAuthService;
import com.ym.ai_story_studio_server.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 管理员认证服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminAuthServiceImpl implements AdminAuthService {

    private final AdminMapper adminMapper;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    @Override
    public AdminInfoVO login(String username, String password) {
        Admin admin = adminMapper.selectOne(
                new LambdaQueryWrapper<Admin>().eq(Admin::getUsername, username)
        );

        if (admin == null || !passwordEncoder.matches(password, admin.getPasswordHash())) {
            log.warn("管理员登录失败: username={}", username);
            throw new BusinessException(ResultCode.LOGIN_FAILED);
        }
        if (admin.getStatus() != null && admin.getStatus() == 0) {
            log.warn("禁用的管理员尝试登录: adminId={}", admin.getId());
            throw new BusinessException(ResultCode.ACCOUNT_DISABLED);
        }

        // 更新最后登录时间
        Admin update = new Admin();
        update.setId(admin.getId());
        update.setLastLoginAt(LocalDateTime.now());
        adminMapper.updateById(update);

        String token = jwtUtil.generateToken(admin.getId(), JwtUtil.TYPE_ADMIN);
        log.info("管理员登录成功: adminId={}, username={}", admin.getId(), username);

        return new AdminInfoVO(
                token,
                admin.getId(),
                admin.getUsername(),
                admin.getDisplayName(),
                admin.getLastLoginAt()
        );
    }

    @Override
    public AdminInfoVO me(Long adminId) {
        Admin admin = adminMapper.selectById(adminId);
        if (admin == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "管理员不存在");
        }
        return AdminInfoVO.me(admin.getId(), admin.getUsername(), admin.getDisplayName(), admin.getLastLoginAt());
    }
}
