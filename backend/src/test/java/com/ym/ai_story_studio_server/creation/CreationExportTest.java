package com.ym.ai_story_studio_server.creation;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static com.ym.ai_story_studio_server.creation.CreationTypes.*;
class CreationExportTest {
    @Test void longStructuredPackageExportsWithoutExceedingExcelCellLimit() throws Exception {
        var json=new ObjectMapper();var original=new StoryboardContract(json).parse(StoryboardContractTest.BOARD,30,java.util.Set.of());
        var assets=new java.util.ArrayList<>(original.assets());
        for(int i=0;i<10;i++)assets.add(new Asset("extra"+i,"PROP","额外道具"+i,"长".repeat(4000)));
        var board=new Board(1,original.title(),assets,original.shots(),original.reviewNotes());
        var brief=new Brief("虚构故事","青年","短视频","探索",30,"16:9","纯虚构",List.of());
        var d=new Draft(1,5,"故事",new Body(brief,"剧本",1,true,board,1,true),null,List.of());
        assertThat(new CreationExport(null,json).workbook(d)).isNotEmpty();
    }
    @Test void fourLegacySheetsKeepTheFirstSixColumnsAndExtendedData() throws Exception {
        var json=new ObjectMapper();var contract=new StoryboardContract(json);
        var board=contract.parse(StoryboardContractTest.BOARD,30,java.util.Set.of());
        var brief=new Brief("虚构故事","青年","短视频","探索",30,"16:9","纯虚构",List.of());
        var body=new Body(brief,"=THIS_IS_LITERAL_TEXT",1,true,board,1,true);
        var draft=new Draft(1,5,"故事",body,null,List.of());
        byte[] data=new CreationExport(null,json).workbook(draft);
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(data))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(6);
            assertThat(wb.getSheet("分镜").getRow(0).getCell(1).getStringCellValue()).isEqualTo("剧本");
            assertThat(wb.getSheet("分镜").getRow(0).getCell(5).getStringCellValue()).isEqualTo("分镜图");
            assertThat(wb.getSheet("分镜").getRow(1).getCell(2).getStringCellValue()).isEqualTo("守塔人");
            assertThat(wb.getSheet("分镜").getRow(1).getCell(6).getNumericCellValue()).isEqualTo(15);
            assertThat(wb.getSheet("创作记录").getRow(3).getCell(1).getCellType()).isEqualTo(org.apache.poi.ss.usermodel.CellType.STRING);
        }
    }
}
