package com.ym.ai_story_studio_server.controller;

import com.ym.ai_story_studio_server.budget.TextBudgetLedger;
import com.ym.ai_story_studio_server.common.Result;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only audit summary, protected by the existing /api/admin/ JWT boundary. */
@RestController
@RequestMapping("/api/admin/generation-budget")
@RequiredArgsConstructor
public class AdminGenerationBudgetController {
    private final TextBudgetLedger ledger;
    private final com.ym.ai_story_studio_server.provider.TextProviderProperties properties;
    public record View(boolean textLimitEnforced,java.math.BigDecimal limitCny,java.math.BigDecimal reservedCny,
        java.math.BigDecimal remainingCny,String blockedReason,long unresolvedCount) {}

    @GetMapping
    public Result<View> status() {
        var historical=ledger.status();
        return Result.success(new View(!properties.isUnlimitedText(),historical.limitCny(),historical.reservedCny(),
            historical.remainingCny(),historical.blockedReason(),historical.unresolvedCount()));
    }
}
