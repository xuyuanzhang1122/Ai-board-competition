package com.ym.ai_story_studio_server.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.*;

/** Fresh official model discovery. No legacy client, seed catalog or supplier fallback. */
@Component
public class OfficialModelCatalogClient implements DisposableBean {
    public record Model(String code, String name, String provider, String type, String sourceUrl, String metadata) {}
    private final TextProviderProperties properties;
    private final RestClient.Builder builder;
    private final HttpComponentsClientHttpRequestFactory ownedFactory;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public OfficialModelCatalogClient(TextProviderProperties properties) {
        this.properties=properties;
        this.ownedFactory=OfficialTextProvider.productionRequestFactory();
        this.builder=RestClient.builder().requestFactory(ownedFactory);
    }
    OfficialModelCatalogClient(TextProviderProperties properties, RestClient.Builder builder) {
        this.properties=properties; this.builder=builder; this.ownedFactory=null;
    }
    @Override public void destroy() throws Exception { if(ownedFactory!=null) ownedFactory.destroy(); }

    public List<Model> fetch() {
        List<Model> result=new ArrayList<>();
        fetch(properties.getDeepseek(), "DeepSeek", Set.of("https://api.deepseek.com"), result);
        fetch(properties.getMimo(), "MiMo", Set.of("https://api.xiaomimimo.com/v1", "https://token-plan-cn.xiaomimimo.com/v1"), result);
        Set<String> codes=new HashSet<>();
        for(Model model:result) if(!codes.add(model.code())) throw error("上游目录包含重复模型编码，未同步");
        return List.copyOf(result);
    }
    private void fetch(TextProviderProperties.Endpoint endpoint,String provider,Set<String> allowed,List<Model> result) {
        if(endpoint==null || !endpoint.isEnabled()) return;
        String base=endpoint.getBaseUrl()==null?"":endpoint.getBaseUrl().trim().replaceAll("/+$", "");
        if(!allowed.contains(base)) throw error("模型目录必须使用官方入口");
        if(endpoint.getApiKey()==null || endpoint.getApiKey().isBlank()) throw error("官方模型目录凭据未配置");
        try {
            String raw=builder.clone().baseUrl(base).build().get().uri("/models")
                .header(HttpHeaders.AUTHORIZATION,"Bearer "+endpoint.getApiKey()).retrieve()
                .onStatus(status -> !status.is2xxSuccessful(),(request,response)-> {throw error("官方模型目录请求失败");})
                .body(String.class);
            JsonNode root=json.readTree(raw==null?"":raw);
            if(root==null || !root.path("data").isArray()) throw error("官方模型目录格式无效");
            for(JsonNode row:root.path("data")) {
                String code=row.path("id").asText("");
                if(!code.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}")) throw error("官方模型目录编码无效");
                String name=row.path("name").asText(code);
                if(name.isBlank() || name.length()>200) name=code;
                result.add(new Model(code,name,provider,type(row,code),base+"/models",row.toString()));
            }
        } catch(BusinessException e){throw e;}
        catch(Exception e){throw error("官方模型目录暂不可用，请刷新重试");}
    }
    private String type(JsonNode row,String code) {
        JsonNode output=row.path("output_modalities");
        if(output.isArray()) {
            for(JsonNode modality:output) if("text".equals(modality.asText())) return "LANGUAGE";
            for(JsonNode modality:output) {
                if("image".equals(modality.asText())) return "IMAGE";
                if("video".equals(modality.asText())) return "VIDEO";
                if("audio".equals(modality.asText())) return "AUDIO";
            }
            return "OTHER";
        }
        // MiMo lists ids without modalities; reserve its documented speech families for audio.
        String id=code.toLowerCase(Locale.ROOT);
        if(id.contains("-tts") || id.contains("-asr")) return "AUDIO";
        if(id.contains("-image")) return "IMAGE";
        if(id.contains("-video")) return "VIDEO";
        return "LANGUAGE";
    }
    private BusinessException error(String message){return new BusinessException(ResultCode.AI_SERVICE_ERROR,message);}
}
