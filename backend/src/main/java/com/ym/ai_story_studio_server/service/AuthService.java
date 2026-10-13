package com.ym.ai_story_studio_server.service;

import com.ym.ai_story_studio_server.dto.auth.PhoneLoginVO;

/**
 * 认证服务接口
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
public interface AuthService {

    /**
     * 发送验证码
     *
     * @param phone 手机号
     */
    void sendVerificationCode(String phone);

    /**
     * 手机号登录
     * <p>首次登录自动注册用户并创建钱包
     *
     * @param phone 手机号
     * @param code 验证码
     * @param inviteCode 邀请码（可选）
     * @return 登录信息（含Token）
     */
    PhoneLoginVO phoneLogin(String phone, String code, String inviteCode);

    /**
     * 微信登录（V2规划）
     *
     * @param code 微信授权码
     * @return 登录信息（含Token）
     */
    PhoneLoginVO wechatLogin(String code);

    /**
     * 普通用户用户名密码登录
     * <p>不自动注册：账号需由管理员在后台创建或补齐用户名密码后方可登录
     *
     * @param username 用户名
     * @param password 明文密码
     * @return 登录信息（含 Token）
     */
    PhoneLoginVO usernameLogin(String username, String password);
}
