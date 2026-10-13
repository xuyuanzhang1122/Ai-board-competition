package com.ym.ai_story_studio_server.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 管理员账号表
 */
@Data
@TableName("admins")
public class Admin {

    /**
     * 管理员ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 用户名（登录名）
     */
    private String username;

    /**
     * BCrypt 密码哈希
     */
    private String passwordHash;

    /**
     * 显示名称
     */
    private String displayName;

    /**
     * 状态：1正常 0禁用
     */
    private Integer status;

    /**
     * 最后登录时间
     */
    private LocalDateTime lastLoginAt;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
