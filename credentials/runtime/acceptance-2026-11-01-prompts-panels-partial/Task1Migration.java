import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ym.ai_story_studio_server.workbench.*;
import com.ym.ai_story_studio_server.util.AdminContext;
import java.util.*;
public class Task1Migration {
  static void check(boolean b,String message){if(!b)throw new AssertionError(message);}
  public static void main(String[] args) {
    String url=System.getenv("TASK1_DB_URL"),password=System.getenv("TASK1_DB_PASSWORD");
    String migration="filesystem:"+args[0]+"/backend/src/main/resources/db/migration";
    Flyway.configure().dataSource(url,"root",password).locations(migration).target("44").load().migrate();
    var ds=new DriverManagerDataSource(url,"root",password);var db=new JdbcTemplate(ds);
    db.update("INSERT INTO users(id,nickname) VALUES(92200001,'迁移测试')");
    db.update("INSERT INTO prompt_templates(id,user_id,category,name,content,is_system) VALUES(92200001,NULL,'CUSTOM','系统迁移测试','旧系统内容 {{literal}}',1),(92200002,92200001,'CUSTOM','用户历史测试','用户自定义原文',0)");
    db.update("INSERT INTO style_presets(id,code,name,prompt_prefix,enabled) VALUES(92200001,'task1_style','风格测试','旧风格原文',1),(92200002,'task1_disabled','停用风格','停用风格历史',0)");
    Flyway.configure().dataSource(url,"root",password).locations(migration).target("45").load().migrate();
    check(db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='45' AND success=1",Integer.class)==1,"V45 schema history");
    check(db.queryForObject("SELECT content FROM prompt_templates WHERE id=92200002",String.class).equals("用户自定义原文"),"user history preserved");
    check(db.queryForObject("SELECT content FROM workbench_prompts WHERE stage='SYSTEM_TEMPLATE_92200001' AND version=1",String.class).equals("旧系统内容 {{literal}}"),"system history preserved");
    check(db.queryForObject("SELECT prompt_prefix FROM style_presets WHERE id=92200001",String.class).equals("旧风格原文"),"style history preserved");
    var library=new WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)));
    check(library.published("STYLE_PRESET_1").content().isEmpty(),"blank historical style remains blank");
    check(library.publishedOrNull("STYLE_PRESET_92200002")==null,"disabled preset cannot fallback");
    var renderer=new ManagedPromptRenderer(library);var media=new MediaPromptSnapshots(db,renderer,new ObjectMapper());
    var frozen=media.render("SHOT_VIDEO",Map.of("scriptText","原文"),"3DGC",Map.of("model","stub","aspectRatio","16:9","duration",5),List.of(new MediaPromptSnapshots.Reference("https://example.org/a.png","角色甲")),null);
    media.save(92200001L,92200001L,frozen);AdminContext.setAdminId(1L);
    var created=library.createPrompt(new WorkbenchLibraryService.PromptCreate("SHOT_VIDEO","修订规则：{{scriptText}}","scriptText","VIDEO","MySQL发布验证"));
    library.changePromptStatus("SHOT_VIDEO",created.version(),new WorkbenchLibraryService.PromptStatus("PUBLISHED",1));
    check(media.load(92200001L,92200001L).prompt().equals(frozen.prompt()),"accepted snapshot immutable");
    check(media.render("SHOT_VIDEO",Map.of("scriptText","新原文"),null,Map.of(),List.of(),null).prompt().equals("修订规则：新原文"),"future requests use publication");
    library.changePromptStatus("SHOT_VIDEO",created.version(),new WorkbenchLibraryService.PromptStatus("DISABLED",created.version()));
    check(library.publishedOrNull("SHOT_VIDEO")==null,"disabled stage no fallback");
    check(db.queryForObject("SELECT content FROM workbench_prompts WHERE stage='SHOT_VIDEO' AND version=1",String.class).contains("{{scriptText}}"),"old published content unchanged");
    Flyway.configure().dataSource(url,"root",password).locations(migration).target("45").load().validate();
    System.out.println("TASK1 MYSQL PASS: V1-V44 -> seeded legacy/user/style history -> V45; publication/replacement/disable/accepted snapshots verified; no provider calls");
  }
}
