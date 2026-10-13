package com.ym.ai_story_studio_server.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ym.ai_story_studio_server.dto.admin.CreateUserRequest;
import com.ym.ai_story_studio_server.dto.admin.SetPasswordRequest;
import com.ym.ai_story_studio_server.dto.admin.UpdateUserRequest;
import com.ym.ai_story_studio_server.dto.admin.UserDetailVO;
import com.ym.ai_story_studio_server.dto.admin.UserListItemVO;

/**
 * 后台用户管理服务
 */
public interface AdminUserService {

    /**
     * 分页 + 关键字搜索用户（匹配昵称 / 用户名 / 手机号）
     */
    Page<UserListItemVO> pageUsers(int page, int size, String keyword);

    /**
     * 用户详情（含项目/订单/任务/资产摘要）
     */
    UserDetailVO getUserDetail(Long userId);

    /**
     * 管理员创建用户（用户名 + 密码，可选昵称/头像/初始积分）
     */
    UserDetailVO createUser(CreateUserRequest request);

    /**
     * 编辑昵称 / 头像 / 状态
     */
    UserDetailVO updateUser(Long userId, UpdateUserRequest request);

    /**
     * 设置 / 重置用户名密码
     */
    void setPassword(Long userId, SetPasswordRequest request);

    /**
     * 调整积分（增量，调整后不为负）
     */
    UserDetailVO adjustPoints(Long userId, Integer delta, String remark);

    /**
     * 删除用户（DB 外键级联清理认证/钱包/项目等关联数据）
     */
    void deleteUser(Long userId);
}
