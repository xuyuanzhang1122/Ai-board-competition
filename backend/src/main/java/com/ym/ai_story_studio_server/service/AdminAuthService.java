package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.dto.admin.AdminInfoVO;

/**
 * 管理员认证服务
 */
public interface AdminAuthService {

    /**
     * 管理员登录
     *
     * @param username 用户名
     * @param password 明文密码
     * @return 管理员信息（含 ADMIN token）
     */
    AdminInfoVO login(String username, String password);

    /**
     * 获取当前登录管理员信息
     *
     * @param adminId 管理员ID
     * @return 管理员信息（不含 token）
     */
    AdminInfoVO me(Long adminId);
}
