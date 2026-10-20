package com.ym.ai_story_studio_server.creation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.Sheet;
import org.springframework.stereotype.Service;
import java.io.ByteArrayOutputStream;
import java.util.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;
import static com.ym.ai_story_studio_server.creation.StoryboardContract.require;

@Service
public class CreationExport {
    private final CreationService creation;
    private final ObjectMapper json;
    public CreationExport(CreationService creation,ObjectMapper json){this.creation=creation;this.json=json;}
    public byte[] export(long id){return workbook(creation.detail(id));}
    byte[] workbook(Draft draft){
        Body b=draft.body();require(b.storyboard()!=null&&b.scriptConfirmed()&&b.boardConfirmed()&&b.scriptVersion()==b.boardScriptVersion(),"请确认当前剧本和分镜后再导出");
        try(var wb=new XSSFWorkbook();var out=new ByteArrayOutputStream()) {
            var shots=wb.createSheet("分镜");
            row(shots,0,"序号","剧本","出场人物","场景","道具","分镜图","时长（秒）","景别","运镜","旁白","对白","图片提示词","视频提示词","镜头ID","引用来源ID");
            Map<String,String> names=new HashMap<>();for(var a:b.storyboard().assets())names.put(a.id(),a.name());
            for(var s:b.storyboard().shots())row(shots,s.no(),s.no(),s.visual(),join(s.characters(),names),names.get(s.scene()),join(s.props(),names),"",s.duration(),s.shotSize(),s.cameraMovement(),s.narration(),s.dialogue(),s.imagePrompt(),s.videoPrompt(),s.id(),String.join("、",s.sourceIds()));
            for(String kind:List.of("CHARACTER","SCENE","PROP")) {
                Sheet sheet=wb.createSheet(switch(kind){case "CHARACTER"->"出场人物";case "SCENE"->"场景";default->"道具";});
                row(sheet,0,"名称","描述","稳定ID");int n=1;for(var a:b.storyboard().assets())if(a.type().equals(kind))row(sheet,n++,a.name(),a.description(),a.id());
            }
            Sheet sources=wb.createSheet("来源与复核");row(sources,0,"来源ID","标题","网址","授权说明（需人工核验）");int n=1;
            for(var source:b.brief().sources())row(sources,n++,source.id(),source.title(),source.url(),source.license());
            for(String note:b.storyboard().reviewNotes())row(sources,n++,"待复核",note);
            Sheet record=wb.createSheet("创作记录");row(record,0,"格式版本","creation-storyboard-v1");
            row(record,1,"品牌","2026 山东省首届大学生 AI 大模型创新传播大赛 · 你的不对我的队");
            row(record,2,"声明","本版本仅供参赛展示与评审使用，非正式商业版本。");
            row(record,3,"剧本",b.script());row(record,4,"创作ID / 版本",draft.id()+" / "+draft.revision());
            row(record,5,"兼容说明","前四Sheet兼容旧导入器；旧导入仅保留前六列与资产，不支持扩展字段完整往返。完整结构以服务端创作记录为准。");
            String full=json.writeValueAsString(b.storyboard());
            n=6;
            for(int start=0;start<full.length();start+=30000)row(record,n++,"完整分镜JSON 分块 "+(start/30000+1),full.substring(start,Math.min(start+30000,full.length())));
            for(var run:draft.runs())row(record,n++,"运行 "+run.id(),run.stage()+" / "+run.model()+" / 提示词 v"+run.promptVersion()+" / job "+run.jobId()+" / "+run.status());
            for(int i=0;i<wb.getNumberOfSheets();i++) {Sheet s=wb.getSheetAt(i);s.createFreezePane(0,1);s.setColumnWidth(0,18*256);for(int col=1;col<s.getRow(0).getLastCellNum();col++)s.setColumnWidth(col,Math.min(col==1?56:24,80)*256);}
            wb.write(out);return out.toByteArray();
        }catch(Exception e){throw new IllegalStateException("分镜导出失败",e);}
    }
    private String join(List<String> refs,Map<String,String> names){return String.join("、",refs.stream().map(names::get).toList());}
    private void row(Sheet sheet,int index,Object... values){var row=sheet.createRow(index);for(int i=0;i<values.length;i++){var cell=row.createCell(i);Object v=values[i];if(v instanceof Number number)cell.setCellValue(number.doubleValue());else cell.setCellValue(v==null?"":v.toString());}}
}
