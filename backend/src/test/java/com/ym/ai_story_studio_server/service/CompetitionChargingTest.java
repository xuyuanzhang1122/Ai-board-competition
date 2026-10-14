package com.ym.ai_story_studio_server.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CompetitionChargingTest {
    @Test
    void freeGenerationDoesNotInventWalletBalanceOrTransactionIds() {
        var service = new ChargingService();
        var result = service.charge(ChargingService.ChargingRequest.builder()
                .jobId(1L).bizType("TEXT_GENERATION").modelCode("deepseek-flash").quantity(1).build());
        assertThat(result.getTotalCost()).isZero();
        assertThat(result.getUnit()).isEqualTo("COMPETITION_FREE");
        assertThat(result.getBalanceBefore()).isNull();
        assertThat(result.getBalanceAfter()).isNull();
        assertThat(result.getTransactionId()).isNull();
        assertThat(result.getUsageChargeId()).isNull();
    }
}
