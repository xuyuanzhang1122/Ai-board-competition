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

    @GetMapping
    public Result<TextBudgetLedger.Status> status() {
        return Result.success(ledger.status());
    }
}
