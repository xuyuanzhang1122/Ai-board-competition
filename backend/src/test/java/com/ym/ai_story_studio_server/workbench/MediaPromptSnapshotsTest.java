package com.ym.ai_story_studio_server.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.*;
import java.util.*;
import com.ym.ai_story_studio_server.util.AdminContext;
import static org.assertj.core.api.Assertions.*;
import static com.ym.ai_story_studio_server.workbench.WorkbenchLibraryService.*;

class MediaPromptSnapshotsTest {
    JdbcTemplate db; WorkbenchLibraryService library; MediaPromptSnapshots media;
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:media"+System.nanoTime()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(ds);
        db.execute("CREATE TABLE creation_prompts(stage VARCHAR(20),version INT,content CLOB)");
        db.execute("CREATE TABLE prompt_templates(id BIGINT,content CLOB,is_system INT)");
        db.execute("CREATE TABLE style_presets(id BIGINT,code VARCHAR(64),name VARCHAR(64),prompt_prefix CLOB,enabled INT)");
        db.update("INSERT INTO prompt_templates VALUES(1,'old system',1),(2,'user history',0)");
        db.update("INSERT INTO style_presets VALUES(1,'style','风格','旧风格',1)");
        for(var file:List.of("V40__workbench_library.sql","V45__remaining_managed_prompts.sql"))
          for(String sql:Files.readString(Path.of("src/main/resources/db/migration/"+file)).split(";"))if(!sql.isBlank())db.execute(sql);
        library=new WorkbenchLibraryService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)));
        media=new MediaPromptSnapshots(db,new ManagedPromptRenderer(library),new ObjectMapper()); AdminContext.setAdminId(7L);
    }
    @Test void resolvesAndFreezesAssetOverridesAndReferenceOrderBeforeDispatch() {
        db.execute("CREATE TABLE projects(id BIGINT,style_code VARCHAR(64))");
        db.update("INSERT INTO projects VALUES(1,'REALISTIC')");
        db.execute("CREATE TABLE storyboard_shots(id BIGINT,project_id BIGINT,script_text CLOB,deleted_at TIMESTAMP)");
        db.update("INSERT INTO storyboard_shots VALUES(10,1,'原分镜',NULL)");
        db.execute("CREATE TABLE shot_bindings(id BIGINT,shot_id BIGINT,bind_type VARCHAR(16),bind_id BIGINT)");
        for(String kind:List.of("character","scene","prop")) {
            db.execute("CREATE TABLE "+kind+"_library(id BIGINT,name VARCHAR(64),description CLOB,thumbnail_url VARCHAR(512),deleted_at TIMESTAMP)");
            db.execute("CREATE TABLE project_"+kind+"s(id BIGINT,project_id BIGINT,library_"+kind+"_id BIGINT,display_name VARCHAR(64),override_description CLOB,thumbnail_url VARCHAR(512))");
        }
        db.execute("CREATE TABLE asset_refs(project_id BIGINT,ref_type VARCHAR(32),ref_owner_id BIGINT,asset_version_id BIGINT)");
        db.execute("CREATE TABLE assets(id BIGINT,project_id BIGINT,owner_type VARCHAR(16),owner_id BIGINT)");
        db.execute("CREATE TABLE asset_versions(id BIGINT,asset_id BIGINT,url VARCHAR(512),status VARCHAR(16),version_no INT)");
        db.update("INSERT INTO character_library VALUES(20,'旧角色','旧描述','https://example.org/person.png',NULL)");
        db.update("INSERT INTO project_characters VALUES(21,1,20,'覆盖角色','覆盖描述','https://via.placeholder.com/person')");
        db.update("INSERT INTO project_scenes VALUES(31,1,NULL,'场景','海岸','https://example.org/scene.png')");
        db.update("INSERT INTO project_props VALUES(41,1,NULL,'道具','纸伞','https://example.org/prop.png')");
        db.update("INSERT INTO shot_bindings VALUES(1,10,'PSCENE',31),(2,10,'PCHAR',21),(3,10,'PPROP',41)");
        db.update("INSERT INTO asset_versions VALUES(51,50,'https://example.org/shot.png','READY',1)");
        db.update("INSERT INTO asset_refs VALUES(1,'SHOT_IMG_CURRENT',10,51)");
        var image=media.forTarget(1L,21L,"CHARACTER_IMAGE",Map.of("model","stub","aspectRatio","1:1"),null,null);
        assertThat(image.prompt()).contains("覆盖角色","覆盖描述").doesNotContain("旧描述");
        var video=media.forTarget(1L,10L,"SHOT_VIDEO",Map.of("model","stub","aspectRatio","16:9","duration",5),null,null);
        assertThat(video.referenceUrls()).containsExactly("https://example.org/person.png","https://example.org/prop.png","https://example.org/scene.png","https://example.org/shot.png");
        db.update("INSERT INTO prop_library VALUES(40,'纸伞','道具','https://example.org/library-prop.png',NULL)");
        db.update("UPDATE project_props SET thumbnail_url=NULL,library_prop_id=40 WHERE id=41");
        var selected=List.of(
            media.selectedReference(1L,"character",21L,"https://via.placeholder.com/person","选择角色"),
            media.selectedReference(1L,"prop",41L,null,"选择道具"),
            new MediaPromptSnapshots.Reference("https://example.org/scene.png","场景"));
        var single=media.forTarget(1L,10L,"SHOT_VIDEO",Map.of("model","stub"),null,selected);
        assertThat(single.referenceUrls()).containsExactly("https://example.org/person.png","https://example.org/library-prop.png","https://example.org/scene.png","https://example.org/shot.png");
        assertThat(single.prompt()).contains("选择角色","选择道具");
        assertThatThrownBy(()->media.selectedReference(2L,"character",21L,null,"跨项目")).isInstanceOf(org.springframework.dao.EmptyResultDataAccessException.class);
        media.save(1L,10L,video);
        db.update("UPDATE storyboard_shots SET script_text='后改分镜' WHERE id=10");
        db.update("UPDATE project_scenes SET thumbnail_url='https://example.org/new.png' WHERE id=31");
        assertThat(media.load(1L,10L).prompt()).contains("原分镜").doesNotContain("后改分镜");
        assertThat(media.load(1L,10L).referenceUrls()).contains("https://example.org/scene.png").doesNotContain("https://example.org/new.png");
    }
    @AfterEach void clear(){AdminContext.clear();}
    @Test void freezesFinalPromptReferencesAndParametersAtAcceptance() {
        var request=media.render("SHOT_VIDEO",Map.of("scriptText","原文"),"3DGC",Map.of("model","stub","aspectRatio","16:9","duration",5),
                List.of(new MediaPromptSnapshots.Reference("https://example.org/a.png","角色甲")),null);
        media.save(10L,11L,request);
        var next=library.createPrompt(new PromptCreate("SHOT_VIDEO","新版本：{{scriptText}}","scriptText","VIDEO","change"));
        library.changePromptStatus("SHOT_VIDEO",next.version(),new PromptStatus("PUBLISHED",1));
        var saved=media.load(10L,11L);
        assertThat(saved.prompt()).contains("原文","角色甲","三维动画").doesNotContain("新版本");
        assertThat(saved.templates()).extracting(ManagedPromptRenderer.Rendered::version).containsOnly(1);
        assertThat(saved.parameters()).containsEntry("model","stub").containsEntry("duration",5);
        assertThat(saved.references()).extracting(MediaPromptSnapshots.Reference::url).containsExactly("https://example.org/a.png");
        assertThat(media.render("SHOT_VIDEO",Map.of("scriptText","原文"),null,Map.of("model","stub"),List.of(),null).prompt()).startsWith("新版本");
        library.changePromptStatus("SHOT_VIDEO",next.version(),new PromptStatus("DISABLED",next.version()));
        assertThatThrownBy(()->media.render("SHOT_VIDEO",Map.of("scriptText","x"),null,Map.of(),List.of(),null)).hasMessageContaining("发布");
        assertThat(media.load(10L,11L).prompt()).isEqualTo(saved.prompt());
        assertThatThrownBy(()->media.load(10L,999L)).hasMessageContaining("快照");
    }
    @Test void preservesUserOverridesAndHistoricRowsWhileSystemPresetsPublish() {
        var custom="自定义 {{scriptText}} 历史内容";
        assertThat(media.render("SHOT_IMAGE",Map.of("scriptText","default"),null,Map.of(),List.of(),custom).prompt()).contains(custom);
        library.changePromptStatus("SHOT_IMAGE",1,new PromptStatus("DISABLED",1));
        assertThatThrownBy(()->media.render("SHOT_IMAGE",Map.of("scriptText","default"),null,Map.of(),List.of(),custom)).hasMessageContaining("发布");
        assertThat(db.queryForObject("SELECT content FROM prompt_templates WHERE id=2",String.class)).isEqualTo("user history");
        assertThat(library.published("SYSTEM_TEMPLATE_1").content()).isEqualTo("old system");
        assertThat(library.published("STYLE_PRESET_1").content()).isEqualTo("旧风格");
        var next=library.createPrompt(new PromptCreate("SYSTEM_TEMPLATE_1","new system","","TEXT","change"));
        library.changePromptStatus(next.stage(),next.version(),new PromptStatus("PUBLISHED",1));
        assertThat(db.queryForObject("SELECT content FROM prompt_templates WHERE id=1",String.class)).isEqualTo("old system");
        assertThat(library.published(next.stage()).content()).isEqualTo("new system");
    }
}
