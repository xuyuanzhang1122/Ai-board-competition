package com.ym.ai_story_studio_server.controller;

import com.ym.ai_story_studio_server.dto.payment.CreateNativeOrderRequest;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.service.PaymentService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CompetitionPaymentTest {
    @Test
    void competitionCannotCreateRechargeOrdersEvenThroughDirectApi() {
        PaymentService service = mock(PaymentService.class);
        var controller = new PaymentController(service);
        assertThatThrownBy(() -> controller.createOrder(new CreateNativeOrderRequest(null, 100, null)))
                .isInstanceOf(BusinessException.class).hasMessageContaining("参赛");
        verifyNoInteractions(service);
    }
}
