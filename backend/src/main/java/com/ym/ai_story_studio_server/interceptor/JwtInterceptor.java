package com.ym.ai_story_studio_server.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.annotation.NoAuth;
import com.ym.ai_story_studio_server.common.Result;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.config.JwtProperties;
import com.ym.ai_story_studio_server.util.AdminContext;
import com.ym.ai_story_studio_server.util.JwtUtil;
import com.ym.ai_story_studio_server.util.UserContext;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.security.SignatureException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.util.pattern.PathPattern;

/**
 * JWT拦截器
 *
 * <p>拦截所有HTTP请求，验证JWT Token的有效性
 *
 * <p>核心职责：
 * <ul>
 *   <li>检查接口是否标记@NoAuth注解，如果有则放行</li>
 *   <li>从请求头提取JWT Token</li>
 *   <li>验证Token有效性（签名、过期时间）</li>
 *   <li>解析userId并存入Request Attribute和UserContext</li>
 *   <li>认证失败时返回统一格式的错误响应</li>
 * </ul>
 *
 * <p>拦截流程：
 * <pre>
 * 1. 检查@NoAuth注解 → 有则放行
 * 2. 提取Token → 无则返回401 UNAUTHORIZED
 * 3. 验证Token → 无效则返回对应错误码
 * 4. 解析userId → 存入上下文
 * 5. 放行请求
 * </pre>
 *
 * <p>错误码映射：
 * <ul>
 *   <li>Token缺失 → 40100 UNAUTHORIZED</li>
 *   <li>Token格式错误 → 40101 TOKEN_INVALID</li>
 *   <li>Token已过期 → 40102 TOKEN_EXPIRED</li>
 *   <li>签名验证失败 → 40101 TOKEN_INVALID</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final JwtProperties jwtProperties;
    private final ObjectMapper objectMapper;
    private final com.ym.ai_story_studio_server.mapper.UserMapper userMapper;

    /**
     * 请求处理前拦截
     *
     * @param request  HTTP请求
     * @param response HTTP响应
     * @param handler  处理器
     * @return true=放行，false=拦截
     */
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 1. 检查是否为HandlerMethod（Controller方法）
        if (!(handler instanceof HandlerMethod)) {
            // 不是Controller方法（如静态资源），直接放行
            return true;
        }

        HandlerMethod handlerMethod = (HandlerMethod) handler;

        // 2. 检查方法或类是否标记@NoAuth注解
        boolean hasNoAuth = handlerMethod.hasMethodAnnotation(NoAuth.class)
                || handlerMethod.getBeanType().isAnnotationPresent(NoAuth.class);

        if (hasNoAuth) {
            // 标记了@NoAuth，直接放行
            log.debug("接口 {} 标记@NoAuth，无需认证", request.getRequestURI());
            return true;
        }

        // 3. 从请求头获取Token
        String authHeader = request.getHeader(jwtProperties.getHeader());

        if (authHeader == null || authHeader.trim().isEmpty()) {
            // Token缺失
            log.warn("请求 {} 未携带Token", request.getRequestURI());
            return handleAuthError(response, ResultCode.UNAUTHORIZED, "未登录或登录已过期，请先登录");
        }

        // 4. 检查Token前缀
        String prefix = jwtProperties.getPrefix();
        if (!authHeader.startsWith(prefix)) {
            // Token格式错误
            log.warn("请求 {} 的Token格式错误，缺少前缀: {}", request.getRequestURI(), prefix);
            return handleAuthError(response, ResultCode.TOKEN_INVALID, "Token格式错误");
        }

        // 5. 去除前缀，获取纯Token
        String token = authHeader.substring(prefix.length());

        try {
            // 6. 验证Token有效性
            if (!jwtUtil.validateToken(token)) {
                log.warn("请求 {} 的Token验证失败", request.getRequestURI());
                return handleAuthError(response, ResultCode.TOKEN_INVALID, "Token无效");
            }

            // 7. 解析 principal ID 与类型
            Long principalId = jwtUtil.getUserIdFromToken(token);
            String type = jwtUtil.getTypeFromToken(token);

            // 8. 基于路径做 USER / ADMIN 隔离
            boolean isAdminPath = isAdminHandler(request, handlerMethod);

            if (isAdminPath) {
                // 管理域接口：只允许 ADMIN token
                if (!JwtUtil.TYPE_ADMIN.equals(type)) {
                    log.warn("非管理员 token 试图访问管理接口: {}", request.getRequestURI());
                    return handleAuthError(response, ResultCode.ACCESS_DENIED, "无权限访问管理接口");
                }
                request.setAttribute("adminId", principalId);
                AdminContext.setAdminId(principalId);
                log.debug("管理员 {} 通过JWT认证，访问接口: {}", principalId, request.getRequestURI());
            } else {
                // 普通用户接口：只允许 USER token，拒绝 ADMIN token 越界
                if (JwtUtil.TYPE_ADMIN.equals(type)) {
                    log.warn("管理员 token 试图访问普通用户接口: {}", request.getRequestURI());
                    return handleAuthError(response, ResultCode.ACCESS_DENIED, "管理员 token 不可访问用户接口");
                }
                // 校验用户仍存在且未禁用（在线被管理员删除/禁用时，下一次请求即生效）
                com.ym.ai_story_studio_server.entity.User user = userMapper.selectById(principalId);
                if (user == null) {
                    log.warn("token 对应用户不存在（可能已被删除）: userId={}", principalId);
                    return handleAuthError(response, ResultCode.USER_NOT_FOUND, "用户不存在，请联系管理员");
                }
                if (user.getStatus() != null && user.getStatus() == 0) {
                    log.warn("被禁用用户尝试访问: userId={}", principalId);
                    return handleAuthError(response, ResultCode.ACCOUNT_DISABLED, "账号已被禁用，请联系管理员");
                }
                request.setAttribute("userId", principalId);
                UserContext.setUserId(principalId);
                log.debug("用户 {} 通过JWT认证，访问接口: {}", principalId, request.getRequestURI());
            }
            return true;

        } catch (ExpiredJwtException e) {
            // Token已过期
            log.warn("请求 {} 的Token已过期: {}", request.getRequestURI(), e.getMessage());
            return handleAuthError(response, ResultCode.TOKEN_EXPIRED, "Token已过期，请重新登录");

        } catch (SignatureException e) {
            // 签名验证失败
            log.warn("请求 {} 的Token签名验证失败: {}", request.getRequestURI(), e.getMessage());
            return handleAuthError(response, ResultCode.TOKEN_INVALID, "Token签名验证失败");

        } catch (Exception e) {
            // 其他异常
            log.error("请求 {} 的Token解析异常: {}", request.getRequestURI(), e.getMessage(), e);
            return handleAuthError(response, ResultCode.UNAUTHORIZED, "认证失败，请重新登录");
        }
    }

    /** Authorize the matched server handler, not raw URI spelling (matrix parameters/encoding). */
    private boolean isAdminHandler(HttpServletRequest request, HandlerMethod handler) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern instanceof String path) return adminPath(path);
        if (pattern instanceof PathPattern path) return adminPath(path.getPatternString());
        RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(handler.getBeanType(), RequestMapping.class);
        return mapping != null && java.util.Arrays.stream(mapping.value()).anyMatch(this::adminPath);
    }

    private boolean adminPath(String path) {
        return "/api/admin".equals(path) || path.startsWith("/api/admin/");
    }

    /**
     * 请求处理完成后清理
     *
     * @param request  HTTP请求
     * @param response HTTP响应
     * @param handler  处理器
     * @param ex       异常（如果有）
     */
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 清理 UserContext / AdminContext，防止内存泄漏
        UserContext.clear();
        AdminContext.clear();
        log.debug("清理 UserContext / AdminContext 完成");
    }

    /**
     * 处理认证错误，返回统一格式的JSON响应
     *
     * @param response   HTTP响应
     * @param resultCode 错误码
     * @param message    错误消息
     * @return false（拦截请求）
     * @throws Exception IO异常
     */
    private boolean handleAuthError(HttpServletResponse response, ResultCode resultCode, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");

        Result<Void> result = Result.error(resultCode, message);
        String json = objectMapper.writeValueAsString(result);

        response.getWriter().write(json);
        return false;
    }
}
