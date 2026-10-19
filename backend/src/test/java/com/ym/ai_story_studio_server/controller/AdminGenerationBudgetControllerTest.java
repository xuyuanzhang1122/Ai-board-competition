package com.ym.ai_story_studio_server.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.budget.TextBudgetLedger;
import com.ym.ai_story_studio_server.config.JwtProperties;
import com.ym.ai_story_studio_server.interceptor.JwtInterceptor;
import com.ym.ai_story_studio_server.mapper.UserMapper;
import com.ym.ai_story_studio_server.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminGenerationBudgetControllerTest {
    @Test
    void matrixAndEncodedAdminPathsCannotBeReclassifiedAsUserEndpoints() throws Exception {
        var ledger = mock(TextBudgetLedger.class);
        var jwt = mock(JwtUtil.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.getUserIdFromToken(anyString())).thenReturn(42L);
        when(jwt.getTypeFromToken("user-test")).thenReturn(JwtUtil.TYPE_USER);
        when(jwt.getTypeFromToken("admin-test")).thenReturn(JwtUtil.TYPE_ADMIN);
        var users = mock(UserMapper.class);
        var active = new com.ym.ai_story_studio_server.entity.User();
        active.setId(42L); active.setStatus(1);
        when(users.selectById(42L)).thenReturn(active);
        var props = new JwtProperties();
        var mvc = MockMvcBuilders.standaloneSetup(new AdminGenerationBudgetController(ledger,new com.ym.ai_story_studio_server.provider.TextProviderProperties()))
                .addInterceptors(new JwtInterceptor(jwt, props, new ObjectMapper(), users)).build();
        when(ledger.status()).thenReturn(new TextBudgetLedger.Status(new BigDecimal("20"), BigDecimal.ZERO,
                new BigDecimal("20"), null, 0));
        for (String path : new String[]{"/api/admin;x=1/generation-budget", "/api/%61dmin/generation-budget"}) {
            mvc.perform(get(java.net.URI.create(path)).header(props.getHeader(), props.getPrefix() + "user-test"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value(com.ym.ai_story_studio_server.common.ResultCode.ACCESS_DENIED.getCode()));
            mvc.perform(get(java.net.URI.create(path)).header(props.getHeader(), props.getPrefix() + "admin-test"))
                    .andExpect(status().isOk());
        }
        verify(ledger, times(2)).status();
        verifyNoInteractions(users);
    }

    @Test
    void onlyAdminCanReadBudgetAndNoAdjustmentEndpointExists() throws Exception {
        var ledger = mock(TextBudgetLedger.class);
        var jwt = mock(JwtUtil.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.getUserIdFromToken(anyString())).thenReturn(42L);
        when(jwt.getTypeFromToken("user-test")).thenReturn(JwtUtil.TYPE_USER);
        when(jwt.getTypeFromToken("admin-test")).thenReturn(JwtUtil.TYPE_ADMIN);
        var props = new JwtProperties();
        var users = mock(UserMapper.class);
        var active = new com.ym.ai_story_studio_server.entity.User();
        active.setId(42L); active.setStatus(1);
        when(users.selectById(42L)).thenReturn(active);
        var mvc = MockMvcBuilders.standaloneSetup(new AdminGenerationBudgetController(ledger,new com.ym.ai_story_studio_server.provider.TextProviderProperties()), new UserProbe())
                .addInterceptors(new JwtInterceptor(jwt, props, new ObjectMapper(), users)).build();
        when(ledger.status()).thenReturn(new TextBudgetLedger.Status(new BigDecimal("20"), BigDecimal.ZERO,
                new BigDecimal("20"), null, 0));
        mvc.perform(get("/api/admin/generation-budget")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/generation-budget").header(props.getHeader(), props.getPrefix() + "user-test"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(com.ym.ai_story_studio_server.common.ResultCode.ACCESS_DENIED.getCode()));
        verifyNoInteractions(ledger);
        mvc.perform(get("/api/budget-user-probe").header(props.getHeader(), props.getPrefix() + "user-test"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/budget-user-probe").header(props.getHeader(), props.getPrefix() + "admin-test"))
                .andExpect(status().isUnauthorized());
        verify(users, times(1)).selectById(42L);
        mvc.perform(get("/api/admin/generation-budget").header(props.getHeader(), props.getPrefix() + "admin-test"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.limitCny").value(20))
                .andExpect(jsonPath("$.data.reservedCny").value(0));
        mvc.perform(post("/api/admin/generation-budget").header(props.getHeader(), props.getPrefix() + "admin-test"))
                .andExpect(status().isMethodNotAllowed());
        verify(ledger, times(1)).status();
    }

    @org.springframework.web.bind.annotation.RestController
    static class UserProbe {
        @org.springframework.web.bind.annotation.GetMapping("/api/budget-user-probe")
        public String status() { return "ok"; }
    }
}
