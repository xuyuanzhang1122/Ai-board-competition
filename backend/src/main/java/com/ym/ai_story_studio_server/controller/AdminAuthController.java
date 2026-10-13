package com.ym.ai_story_studio_server.controller;

import com.ym.ai_story_studio_server.annotation.NoAuth;
import com.ym.ai_story_studio_server.common.Result;
import com.ym.ai_story_studio_server.dto.admin.AdminInfoVO;
import com.ym.ai_story_studio_server.dto.admin.AdminLoginRequest;
import com.ym.ai_story_studio_server.service.AdminAuthService;
import com.ym.ai_story_studio_server.util.AdminContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理员认证控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/auth")
@RequiredArgsConstructor
public class AdminAuthController {

    private final AdminAuthService adminAuthService;

    /**
     * 管理员登录（无需认证）
     */
    @NoAuth
    @PostMapping("/login")
    public Result<AdminInfoVO> login(@Valid @RequestBody AdminLoginRequest request) {
        log.info("收到管理员登录请求: username={}", request.username());
        return Result.success(adminAuthService.login(request.username(), request.password()));
    }

    /**
     * 获取当前管理员信息（需 ADMIN token）
     */
    @GetMapping("/me")
    public Result<AdminInfoVO> me() {
        return Result.success(adminAuthService.me(AdminContext.getAdminId()));
    }
}
