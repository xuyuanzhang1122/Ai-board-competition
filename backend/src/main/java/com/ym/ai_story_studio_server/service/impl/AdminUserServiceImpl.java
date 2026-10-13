package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.dto.admin.CreateUserRequest;
import com.ym.ai_story_studio_server.dto.admin.SetPasswordRequest;
import com.ym.ai_story_studio_server.dto.admin.UpdateUserRequest;
import com.ym.ai_story_studio_server.dto.admin.UserDetailVO;
import com.ym.ai_story_studio_server.dto.admin.UserListItemVO;
import com.ym.ai_story_studio_server.entity.*;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.*;
import com.ym.ai_story_studio_server.service.AdminUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 后台用户管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminUserServiceImpl implements AdminUserService {

    private static final String AUTH_USERNAME = "USERNAME";
    private static final String AUTH_PHONE = "PHONE";

    private final UserMapper userMapper;
    private final UserAuthMapper userAuthMapper;
    private final WalletMapper walletMapper;
    private final WalletTransactionMapper walletTransactionMapper;
    private final ProjectMapper projectMapper;
    private final JobMapper jobMapper;
    private final PayOrderMapper payOrderMapper;
    private final AssetMapper assetMapper;
    private final ToolboxSessionMapper toolboxSessionMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public Page<UserListItemVO> pageUsers(int page, int size, String keyword) {
        // 关键字匹配 user_auth.identifier（手机号 / 用户名）得到额外 userId
        List<Long> matchedIds = Collections.emptyList();
        if (StringUtils.hasText(keyword)) {
            matchedIds = userAuthMapper.selectList(
                            new LambdaQueryWrapper<UserAuth>().like(UserAuth::getIdentifier, keyword))
                    .stream().map(UserAuth::getUserId).distinct().collect(Collectors.toList());
        }

        LambdaQueryWrapper<User> qw = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            List<Long> ids = matchedIds;
            qw.and(w -> {
                w.like(User::getNickname, keyword);
                if (!ids.isEmpty()) {
                    w.or().in(User::getId, ids);
                }
            });
        }
        qw.orderByDesc(User::getCreatedAt);

        Page<User> userPage = userMapper.selectPage(new Page<>(page, size), qw);

        Page<UserListItemVO> result = new Page<>(page, size, userPage.getTotal());
        result.setRecords(toListItems(userPage.getRecords()));
        return result;
    }

    private List<UserListItemVO> toListItems(List<User> users) {
        if (users.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> ids = users.stream().map(User::getId).collect(Collectors.toList());

        Map<Long, String> usernameMap = authMap(ids, AUTH_USERNAME);
        Map<Long, String> phoneMap = authMap(ids, AUTH_PHONE);
        Map<Long, Integer> balanceMap = walletMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(Wallet::getUserId, w -> w.getBalance() == null ? 0 : w.getBalance()));

        return users.stream().map(u -> new UserListItemVO(
                u.getId(),
                u.getNickname(),
                u.getAvatarUrl(),
                usernameMap.get(u.getId()),
                phoneMap.get(u.getId()),
                u.getStatus(),
                balanceMap.getOrDefault(u.getId(), 0),
                u.getCreatedAt()
        )).collect(Collectors.toList());
    }

    private Map<Long, String> authMap(List<Long> userIds, String authType) {
        return userAuthMapper.selectList(
                        new LambdaQueryWrapper<UserAuth>()
                                .eq(UserAuth::getAuthType, authType)
                                .in(UserAuth::getUserId, userIds))
                .stream()
                .collect(Collectors.toMap(UserAuth::getUserId, UserAuth::getIdentifier, (a, b) -> a));
    }

    @Override
    public UserDetailVO getUserDetail(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ResultCode.USER_NOT_FOUND);
        }
        return toDetail(user);
    }

    private UserDetailVO toDetail(User user) {
        Long userId = user.getId();
        String username = oneAuthIdentifier(userId, AUTH_USERNAME);
        String phone = oneAuthIdentifier(userId, AUTH_PHONE);
        Wallet wallet = walletMapper.selectById(userId);

        long projectCount = projectMapper.selectCount(
                new LambdaQueryWrapper<Project>().eq(Project::getUserId, userId));
        long jobCount = jobMapper.selectCount(
                new LambdaQueryWrapper<Job>().eq(Job::getUserId, userId));
        long orderCount = payOrderMapper.selectCount(
                new LambdaQueryWrapper<PayOrder>().eq(PayOrder::getUserId, userId));
        long assetCount = assetMapper.selectCount(
                new LambdaQueryWrapper<Asset>().eq(Asset::getOwnerId, userId));

        return new UserDetailVO(
                user.getId(),
                user.getNickname(),
                user.getAvatarUrl(),
                username,
                phone,
                user.getStatus(),
                wallet != null && wallet.getBalance() != null ? wallet.getBalance() : 0,
                user.getCreatedAt(),
                user.getUpdatedAt(),
                new UserDetailVO.Summary(projectCount, orderCount, jobCount, assetCount)
        );
    }

    private String oneAuthIdentifier(Long userId, String authType) {
        UserAuth auth = userAuthMapper.selectOne(
                new LambdaQueryWrapper<UserAuth>()
                        .eq(UserAuth::getUserId, userId)
                        .eq(UserAuth::getAuthType, authType)
                        .last("LIMIT 1"));
        return auth != null ? auth.getIdentifier() : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserDetailVO createUser(CreateUserRequest request) {
        // 用户名唯一性校验
        Long exists = userAuthMapper.selectCount(
                new LambdaQueryWrapper<UserAuth>()
                        .eq(UserAuth::getAuthType, AUTH_USERNAME)
                        .eq(UserAuth::getIdentifier, request.username()));
        if (exists != null && exists > 0) {
            throw new BusinessException(ResultCode.USER_ALREADY_EXISTS, "用户名已存在");
        }

        User user = new User();
        user.setNickname(StringUtils.hasText(request.nickname()) ? request.nickname() : request.username());
        user.setAvatarUrl(request.avatarUrl());
        user.setStatus(1);
        userMapper.insert(user);

        UserAuth auth = new UserAuth();
        auth.setUserId(user.getId());
        auth.setAuthType(AUTH_USERNAME);
        auth.setIdentifier(request.username());
        auth.setCredential(passwordEncoder.encode(request.password()));
        auth.setVerified(1);
        userAuthMapper.insert(auth);

        // 创建钱包
        Wallet wallet = new Wallet();
        wallet.setUserId(user.getId());
        wallet.setBalance(request.initialBalance() != null ? request.initialBalance() : 0);
        walletMapper.insert(wallet);

        log.info("管理员创建用户: userId={}, username={}", user.getId(), request.username());
        return toDetail(user);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserDetailVO updateUser(Long userId, UpdateUserRequest request) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ResultCode.USER_NOT_FOUND);
        }
        if (request.nickname() != null) {
            user.setNickname(request.nickname());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        if (request.status() != null) {
            user.setStatus(request.status());
        }
        userMapper.updateById(user);
        return toDetail(user);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void setPassword(Long userId, SetPasswordRequest request) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ResultCode.USER_NOT_FOUND);
        }

        UserAuth auth = userAuthMapper.selectOne(
                new LambdaQueryWrapper<UserAuth>()
                        .eq(UserAuth::getUserId, userId)
                        .eq(UserAuth::getAuthType, AUTH_USERNAME)
                        .last("LIMIT 1"));

        String username = request.username();
        String hash = passwordEncoder.encode(request.password());

        if (auth == null) {
            // 尚无用户名认证记录：要求传入用户名以建立
            if (!StringUtils.hasText(username)) {
                throw new BusinessException(ResultCode.PARAM_MISSING, "该用户尚无用户名，请同时提供用户名");
            }
            assertUsernameAvailable(username, null);
            UserAuth created = new UserAuth();
            created.setUserId(userId);
            created.setAuthType(AUTH_USERNAME);
            created.setIdentifier(username);
            created.setCredential(hash);
            created.setVerified(1);
            userAuthMapper.insert(created);
        } else {
            if (StringUtils.hasText(username) && !username.equals(auth.getIdentifier())) {
                assertUsernameAvailable(username, auth.getId());
                auth.setIdentifier(username);
            }
            auth.setCredential(hash);
            userAuthMapper.updateById(auth);
        }
        log.info("管理员重置用户密码: userId={}", userId);
    }

    private void assertUsernameAvailable(String username, Long excludeAuthId) {
        LambdaQueryWrapper<UserAuth> qw = new LambdaQueryWrapper<UserAuth>()
                .eq(UserAuth::getAuthType, AUTH_USERNAME)
                .eq(UserAuth::getIdentifier, username);
        if (excludeAuthId != null) {
            qw.ne(UserAuth::getId, excludeAuthId);
        }
        Long c = userAuthMapper.selectCount(qw);
        if (c != null && c > 0) {
            throw new BusinessException(ResultCode.USER_ALREADY_EXISTS, "用户名已存在");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserDetailVO adjustPoints(Long userId, Integer delta, String remark) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ResultCode.USER_NOT_FOUND);
        }

        Wallet wallet = walletMapper.selectById(userId);
        if (wallet == null) {
            wallet = new Wallet();
            wallet.setUserId(userId);
            wallet.setBalance(0);
            walletMapper.insert(wallet);
        }

        int current = wallet.getBalance() == null ? 0 : wallet.getBalance();
        int next = current + delta;
        if (next < 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "调整后积分不能为负");
        }
        wallet.setBalance(next);
        walletMapper.updateById(wallet);

        // 记录流水
        WalletTransaction tx = new WalletTransaction();
        tx.setUserId(userId);
        tx.setType(delta >= 0 ? "ADMIN_ADJUST_IN" : "ADMIN_ADJUST_OUT");
        tx.setAmount(delta);
        tx.setBalanceAfter(next);
        tx.setBizType("ADMIN_ADJUST");
        tx.setMetaJson(remark != null ? "{\"remark\":\"" + remark.replace("\"", "'") + "\"}" : null);
        tx.setCreatedAt(LocalDateTime.now());
        walletTransactionMapper.insert(tx);

        log.info("管理员调整积分: userId={}, delta={}, balanceAfter={}", userId, delta, next);
        return toDetail(user);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteUser(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ResultCode.USER_NOT_FOUND);
        }
        // V19 toolbox_sessions 外键没有 ON DELETE CASCADE；先清理当前用户的工具箱会话，避免删除用户时触发外键约束失败。
        toolboxSessionMapper.delete(new LambdaQueryWrapper<ToolboxSession>().eq(ToolboxSession::getUserId, userId));
        // users 上的多数外键为 ON DELETE CASCADE，删除用户行会级联清理
        // user_auth / wallets / wallet_transactions / projects / 各资源库等关联数据
        userMapper.deleteById(userId);
        log.info("管理员删除用户: userId={}", userId);
    }
}
