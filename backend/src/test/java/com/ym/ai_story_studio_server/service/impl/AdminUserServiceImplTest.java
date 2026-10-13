package com.ym.ai_story_studio_server.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.ym.ai_story_studio_server.entity.ToolboxSession;
import com.ym.ai_story_studio_server.entity.User;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.mapper.AssetMapper;
import com.ym.ai_story_studio_server.mapper.JobMapper;
import com.ym.ai_story_studio_server.mapper.PayOrderMapper;
import com.ym.ai_story_studio_server.mapper.ProjectMapper;
import com.ym.ai_story_studio_server.mapper.ToolboxSessionMapper;
import com.ym.ai_story_studio_server.mapper.UserAuthMapper;
import com.ym.ai_story_studio_server.mapper.UserMapper;
import com.ym.ai_story_studio_server.mapper.WalletMapper;
import com.ym.ai_story_studio_server.mapper.WalletTransactionMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceImplTest {

    @BeforeAll
    static void initializeMyBatisMetadata() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), "admin-user-test"),
                ToolboxSession.class
        );
    }

    @Mock private UserMapper userMapper;
    @Mock private UserAuthMapper userAuthMapper;
    @Mock private WalletMapper walletMapper;
    @Mock private WalletTransactionMapper walletTransactionMapper;
    @Mock private ProjectMapper projectMapper;
    @Mock private JobMapper jobMapper;
    @Mock private PayOrderMapper payOrderMapper;
    @Mock private AssetMapper assetMapper;
    @Mock private ToolboxSessionMapper toolboxSessionMapper;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks private AdminUserServiceImpl adminUserService;

    @Test
    void deleteUserDeletesToolboxSessionsBeforeUserRow() {
        User user = new User();
        user.setId(101L);
        when(userMapper.selectById(101L)).thenReturn(user);

        adminUserService.deleteUser(101L);

        ArgumentCaptor<LambdaQueryWrapper<ToolboxSession>> query =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(toolboxSessionMapper).delete(query.capture());
        query.getValue().getSqlSegment();
        org.junit.jupiter.api.Assertions.assertTrue(query.getValue().getParamNameValuePairs().containsValue(101L));

        var ordered = inOrder(toolboxSessionMapper, userMapper);
        ordered.verify(toolboxSessionMapper).delete(any(Wrapper.class));
        ordered.verify(userMapper).deleteById(101L);
    }

    @Test
    void deleteUserDoesNotDeleteToolboxSessionsWhenUserMissing() {
        when(userMapper.selectById(404L)).thenReturn(null);

        assertThrows(BusinessException.class, () -> adminUserService.deleteUser(404L));

        verify(toolboxSessionMapper, never()).delete(any(Wrapper.class));
        verify(userMapper, never()).deleteById(404L);
    }
}
