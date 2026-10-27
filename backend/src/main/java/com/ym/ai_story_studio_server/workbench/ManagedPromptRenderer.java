package com.ym.ai_story_studio_server.workbench;

import com.ym.ai_story_studio_server.common.ResultCode;
import com.ym.ai_story_studio_server.exception.BusinessException;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.regex.Pattern;

/** Renders only template tokens, once. User supplied braces are always literal data. */
@Service
public class ManagedPromptRenderer {
    public record Rendered(String stage, int version, String template, Map<String,String> variables,
                           String capability, String rendered) {
        public Rendered { variables=Map.copyOf(variables); }
    }
    private final WorkbenchLibraryService library;
    public ManagedPromptRenderer(WorkbenchLibraryService library) {this.library=library;}
    public Rendered render(String stage, Map<String,String> variables, String capability) {
        var p=library.published(stage);
        if (!capability.equals(p.capability())) throw new BusinessException(ResultCode.CONFIG_ERROR,"提示词能力不匹配："+stage);
        var declared=new HashSet<String>();
        for(String v:p.variables().split(","))if(!v.isBlank())declared.add(v.trim());
        if(!declared.equals(variables.keySet())) throw new BusinessException(ResultCode.PARAM_INVALID,"提示词变量不匹配："+stage);
        var matcher=Pattern.compile("\\{\\{([A-Za-z][A-Za-z0-9_]*)\\}\\}").matcher(p.content());
        var output=new StringBuffer();
        while(matcher.find()) {
            if(!variables.containsKey(matcher.group(1))) throw new BusinessException(ResultCode.CONFIG_ERROR,"模板含未声明变量");
            matcher.appendReplacement(output,java.util.regex.Matcher.quoteReplacement(variables.get(matcher.group(1))));
        }
        matcher.appendTail(output);
        return new Rendered(stage,p.version(),p.content(),variables,p.capability(),output.toString());
    }
}
