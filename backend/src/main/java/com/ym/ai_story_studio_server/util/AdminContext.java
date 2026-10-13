package com.ym.ai_story_studio_server.util;

/**
 * 管理员上下文工具类
 *
 * <p>使用 ThreadLocal 存储当前请求的管理员ID，与 {@link UserContext} 物理隔离，
 * 避免管理员 token 被当作普通用户 UserContext 误用。
 *
 * <p>由 JwtInterceptor 在认证通过后设置，afterCompletion 中清理。
 */
public class AdminContext {

    private static final ThreadLocal<Long> adminIdHolder = new ThreadLocal<>();

    /**
     * 设置当前请求的管理员ID
     */
    public static void setAdminId(Long adminId) {
        adminIdHolder.set(adminId);
    }

    /**
     * 获取当前请求的管理员ID，未设置返回 null
     */
    public static Long getAdminId() {
        return adminIdHolder.get();
    }

    /**
     * 清除当前请求的管理员ID（必须在请求结束时调用）
     */
    public static void clear() {
        adminIdHolder.remove();
    }
}
