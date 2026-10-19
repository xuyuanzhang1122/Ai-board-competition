package com.ym.ai_story_studio_server.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import com.ym.ai_story_studio_server.budget.TextBudgetLedger;
import com.ym.ai_story_studio_server.budget.TextBudgetPolicy;
import com.ym.ai_story_studio_server.util.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Official endpoints only. No automatic retries, supplier fallback or HTTP redirects. */
@Component
public class OfficialTextProvider implements TextGenerationProvider, DisposableBean {
    private static final Set<String> MIMO_ENDPOINTS = Set.of(
            "https://api.xiaomimimo.com/v1", "https://token-plan-cn.xiaomimimo.com/v1");
    private final TextProviderProperties properties;
    private final TextModelAccess modelAccess;
    private final TextBudgetPolicy budgetPolicy;
    private final TextBudgetLedger budgetLedger;
    private final RestClient.Builder builder;
    private final HttpComponentsClientHttpRequestFactory ownedFactory;
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    public OfficialTextProvider(TextProviderProperties properties, TextModelAccess modelAccess,
                                TextBudgetPolicy budgetPolicy, TextBudgetLedger budgetLedger) {
        this.properties = properties;
        this.modelAccess = modelAccess;
        this.budgetPolicy = budgetPolicy;
        this.budgetLedger = budgetLedger;
        this.ownedFactory = productionRequestFactory();
        this.builder = RestClient.builder().requestFactory(ownedFactory);
    }

    OfficialTextProvider(TextProviderProperties properties, RestClient.Builder builder, TextModelAccess modelAccess,
                         TextBudgetPolicy budgetPolicy, TextBudgetLedger budgetLedger) {
        this.properties = properties;
        this.modelAccess = modelAccess;
        this.budgetPolicy = budgetPolicy;
        this.budgetLedger = budgetLedger;
        this.builder = builder;
        this.ownedFactory = null;
    }

    static HttpComponentsClientHttpRequestFactory productionRequestFactory() {
        var manager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofSeconds(15)).setSocketTimeout(Timeout.ofSeconds(90)).build())
                .build();
        var client = HttpClients.custom().setConnectionManager(manager)
                .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(Timeout.ofSeconds(90)).build())
                .disableAutomaticRetries().disableRedirectHandling().build();
        return new HttpComponentsClientHttpRequestFactory(client);
    }

    @Override
    public void destroy() throws Exception {
        if (ownedFactory != null) ownedFactory.destroy();
    }

    private boolean isDeepseek(String model) {
        var definition=modelAccess.definition(model);
        if(definition==null) throw new BusinessException(ResultCode.PARAM_INVALID,"模型不在官方文本目录中");
        return "DeepSeek".equals(definition.provider());
    }

    @Override
    public void validateModelConfiguration(String model) {
        boolean deepseek = isDeepseek(model);
        TextProviderProperties.Endpoint endpoint = deepseek ? properties.getDeepseek() : properties.getMimo();
        if (endpoint == null || !endpoint.isEnabled() || endpoint.getApiKey() == null || endpoint.getApiKey().isBlank()) {
            throw new BusinessException(ResultCode.CONFIG_ERROR, "所选文本供应商尚未启用或未配置凭据");
        }
        String baseUrl = normalizedBaseUrl(endpoint);
        if (deepseek ? !"https://api.deepseek.com".equals(baseUrl) : !MIMO_ENDPOINTS.contains(baseUrl)) {
            throw new BusinessException(ResultCode.CONFIG_ERROR, "文本供应商地址必须使用已支持的官方入口");
        }
        if (!properties.isUnlimitedText()) budgetPolicy.quote(model, 32768);
    }

    private String normalizedBaseUrl(TextProviderProperties.Endpoint endpoint) {
        String url = endpoint.getBaseUrl();
        return url == null ? "" : url.trim().replaceAll("/+$", "");
    }

    @Override
    public void validateRequest(String prompt, String model, Integer maxTokens, Double temperature, Double topP) {
        validateModelConfiguration(model);
        if (prompt == null || prompt.isBlank() || maxTokens == null || maxTokens < 1 || maxTokens > 32768
                || temperature != null && (!Double.isFinite(temperature) || temperature < 0 || temperature > 1)
                || topP != null && (!Double.isFinite(topP) || topP <= 0 || topP > 1)) {
            throw new BusinessException(ResultCode.PARAM_INVALID, "文本输入或生成参数不合法");
        }
        modelAccess.requireEnabled(model);
    }

    @Override
    public TextGenerationResult generateText(String prompt, String model, Integer maxTokens,
                                              Double temperature, Double topP) {
        return generateConversation(List.of(new ChatTurn("user", prompt)),model,maxTokens,temperature,topP);
    }

    @Override
    public TextGenerationResult generateConversation(List<ChatTurn> messages,String model,Integer maxTokens,
                                                      Double temperature,Double topP) {
        if(messages==null || messages.isEmpty() || messages.size()>200
                || messages.stream().anyMatch(turn -> turn==null || !Set.of("user","assistant").contains(turn.role()==null?"":turn.role())
                    || turn.content()==null || turn.content().isBlank())
                || !"user".equals(messages.get(messages.size()-1).role()))
            throw new BusinessException(ResultCode.PARAM_INVALID,"对话上下文格式无效");
        validateRequest(messages.get(messages.size()-1).content(),model,maxTokens,temperature,topP);
        boolean deepseek = isDeepseek(model);
        TextProviderProperties.Endpoint endpoint = deepseek ? properties.getDeepseek() : properties.getMimo();
        String supplier = deepseek ? "DEEPSEEK" : "MIMO";
        Map<String, Object> body = new HashMap<>();
        body.put("model", modelAccess.definition(model).apiModelId());
        body.put("messages",messages.stream().map(turn -> Map.of("role",turn.role(),"content",turn.content())).toList());
        body.put("stream", false);
        body.put(deepseek ? "max_tokens" : "max_completion_tokens", maxTokens);
        if (temperature != null) body.put("temperature", temperature);
        // Both official APIs default to thinking; keep the bounded text-only contract explicit.
        body.put("thinking", Map.of("type", "disabled"));
        if (!deepseek && topP != null) body.put("top_p", topP);

        var reservation = properties.isUnlimitedText() ? null
                : budgetLedger.reserve(budgetPolicy.quote(model, maxTokens), UserContext.getUserId());
        String unrestrictedAuditId=reservation==null
                ? budgetLedger.beginUnrestricted(model,UserContext.getUserId()) : null;
        TextGenerationResult result;
        TextBudgetLedger.Usage observed = null;
        boolean invalidUsage = false;
        try {
            String raw = builder.clone().baseUrl(normalizedBaseUrl(endpoint)).build().post()
                    .uri("/chat/completions").header(HttpHeaders.AUTHORIZATION, "Bearer " + endpoint.getApiKey())
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve()
                    .onStatus(status -> !status.is2xxSuccessful(), (request, response) -> {
                        throw new BusinessException(ResultCode.AI_SERVICE_ERROR,
                                "文本供应商请求失败（HTTP " + response.getStatusCode().value() + "）");
                    }).body(String.class);
            JsonNode root = mapper.readTree(raw == null ? "" : raw);
            // Extract available audit fields before rejecting empty/truncated generation content.
            JsonNode usage = root == null ? mapper.missingNode() : root.path("usage");
            JsonNode total = usage.path("total_tokens");
            Integer input = tokenCount(usage.path("prompt_tokens"));
            Integer output = tokenCount(usage.path("completion_tokens"));
            Integer tokens = tokenCount(total);
            invalidUsage = !usage.isMissingNode() && !usage.isNull() && !usage.isObject()
                    || invalidTokenField(usage.path("prompt_tokens")) || invalidTokenField(usage.path("completion_tokens"))
                    || invalidTokenField(total);
            if ((total.isMissingNode() || total.isNull()) && input != null && output != null
                    && (long) input + output <= Integer.MAX_VALUE) tokens = input + output;
            observed = new TextBudgetLedger.Usage(root == null ? null : root.path("model").asText(null),
                    root == null ? null : root.path("id").asText(null), input, output, tokens);
            JsonNode choice = root == null ? null : root.path("choices").path(0);
            if (choice == null || !choice.path("message").path("content").isTextual()
                    || choice.path("message").path("content").asText().isBlank()
                    || !"stop".equals(choice.path("finish_reason").asText())) {
                throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "文本供应商未返回完整有效结果");
            }
            result = new TextGenerationResult(choice.path("message").path("content").asText(),
                    root.path("model").asText(null), supplier, root.path("id").asText(null), tokens,
                    input, output, reservation == null ? null : reservation.id());
        } catch (BusinessException e) {
            markReview(reservation, unrestrictedAuditId, TextBudgetLedger.ReviewReason.INVALID_RESPONSE, observed);
            throw e;
        } catch (RestClientException e) {
            // Transport may fail after acceptance: do not submit again or expose request/error bodies.
            markReview(reservation, unrestrictedAuditId, TextBudgetLedger.ReviewReason.TRANSPORT_ERROR, observed);
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "文本请求未完成，请核对任务后再尝试");
        } catch (Exception e) {
            markReview(reservation, unrestrictedAuditId, TextBudgetLedger.ReviewReason.INVALID_RESPONSE, observed);
            throw new BusinessException(ResultCode.AI_SERVICE_ERROR, "文本供应商响应无法解析");
        }
        try {
            if (reservation == null) {
                budgetLedger.completeUnrestricted(unrestrictedAuditId,observed,
                        invalidUsage?TextBudgetLedger.ReviewReason.INVALID_USAGE:null);
                return result;
            }
            if (invalidUsage) budgetLedger.recordReview(reservation, observed, TextBudgetLedger.ReviewReason.INVALID_USAGE);
            else budgetLedger.complete(reservation, observed);
        } catch (RuntimeException auditFailure) {
            markReview(reservation, unrestrictedAuditId, TextBudgetLedger.ReviewReason.AUDIT_WRITE_FAILED, observed);
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "文本调用已返回但预算审计保存失败，请核对预留记录");
        }
        return result;
    }

    private void markReview(TextBudgetLedger.Reservation reservation, String unrestrictedAuditId, TextBudgetLedger.ReviewReason reason,
                            TextBudgetLedger.Usage observed) {
        if (reservation == null) {
            budgetLedger.completeUnrestricted(unrestrictedAuditId,observed,reason);
            return;
        }
        try {
            if (observed == null) budgetLedger.requireReview(reservation, reason);
            else budgetLedger.recordReview(reservation, observed, reason);
        } catch (RuntimeException auditFailure) {
            throw new BusinessException(ResultCode.SYSTEM_ERROR, "预算审计保存失败，已预留额度请核对");
        }
    }

    private Integer tokenCount(JsonNode value) {
        return value.isIntegralNumber() && value.canConvertToInt() && value.intValue() >= 0 ? value.intValue() : null;
    }

    private boolean invalidTokenField(JsonNode node) {
        return !node.isMissingNode() && !node.isNull() && tokenCount(node) == null;
    }
}
