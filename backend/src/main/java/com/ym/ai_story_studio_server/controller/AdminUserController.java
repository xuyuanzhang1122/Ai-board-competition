package com.ym.ai_story_studio_server.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ym.ai_story_studio_server.common.Result;
import com.ym.ai_story_studio_server.dto.admin.*;
import com.ym.ai_story_studio_server.service.AdminUserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * 后台用户管理控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    /**
     * 分页 + 关键字搜索
     */
    @GetMapping
    public Result<Page<UserListItemVO>> pageUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {
        return Result.success(adminUserService.pageUsers(page, size, keyword));
    }

    /**
     * 用户详情
     */
    @GetMapping("/{userId}")
    public Result<UserDetailVO> detail(@PathVariable Long userId) {
        return Result.success(adminUserService.getUserDetail(userId));
    }

    /**
     * 创建用户
     */
    @PostMapping
    public Result<UserDetailVO> create(@Valid @RequestBody CreateUserRequest request) {
        return Result.success(adminUserService.createUser(request));
    }

    /**
     * 编辑昵称 / 头像 / 状态
     */
    @PutMapping("/{userId}")
    public Result<UserDetailVO> update(@PathVariable Long userId, @RequestBody UpdateUserRequest request) {
        return Result.success(adminUserService.updateUser(userId, request));
    }

    /**
     * 设置 / 重置用户名密码
     */
    @PutMapping("/{userId}/password")
    public Result<Void> setPassword(@PathVariable Long userId, @Valid @RequestBody SetPasswordRequest request) {
        adminUserService.setPassword(userId, request);
        return Result.success();
    }

    /**
     * 调整积分
     */
    @PostMapping("/{userId}/points")
    public Result<UserDetailVO> adjustPoints(@PathVariable Long userId, @Valid @RequestBody AdjustPointsRequest request) {
        return Result.success(adminUserService.adjustPoints(userId, request.delta(), request.remark()));
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{userId}")
    public Result<Void> delete(@PathVariable Long userId) {
        adminUserService.deleteUser(userId);
        return Result.success();
    }
}
