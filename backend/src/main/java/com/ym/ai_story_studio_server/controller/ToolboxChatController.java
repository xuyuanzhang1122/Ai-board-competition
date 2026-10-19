package com.ym.ai_story_studio_server.controller;

import com.ym.ai_story_studio_server.common.Result;
import com.ym.ai_story_studio_server.dto.toolbox.chat.*;
import com.ym.ai_story_studio_server.service.ToolboxChatService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/toolbox/chat")
public class ToolboxChatController {
    private final ToolboxChatService chat;
    public ToolboxChatController(ToolboxChatService chat){this.chat=chat;}
    public record CreateSession(@Size(max=100) String title) {}
    @GetMapping("/sessions") public Result<List<ChatSession>> sessions(){return Result.success(chat.sessions());}
    @PostMapping("/sessions") public Result<ChatSession> create(@Valid @RequestBody(required=false) CreateSession request){return Result.success(chat.createSession(request==null?null:request.title()));}
    @GetMapping("/sessions/{id}") public Result<ToolboxChatService.Detail> detail(@PathVariable Long id){return Result.success(chat.detail(id));}
    @PostMapping("/sessions/{id}/messages") public Result<ToolboxChatService.Accepted> send(@PathVariable Long id,@Valid @RequestBody ChatSendRequest request){return Result.success(chat.send(id,request));}
    @PostMapping("/messages/{id}/cancel") public Result<ChatMessage> cancel(@PathVariable Long id){return Result.success(chat.cancel(id));}
    @DeleteMapping("/sessions/{id}") public Result<Void> delete(@PathVariable Long id){chat.deleteSession(id);return Result.success();}
}
