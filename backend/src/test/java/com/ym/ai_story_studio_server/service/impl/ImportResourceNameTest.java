package com.ym.ai_story_studio_server.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ImportResourceNameTest {

    @Test
    void stripsNumberingExtensionAndGeneratedModelSuffix() {
        assertEquals("吕洞宾", ImportServiceImpl.extractResourceName("角色/01_吕洞宾_kling-v2_1.png"));
        assertEquals("蓬莱阁", ImportServiceImpl.extractResourceName("场景\\蓬莱阁_image-model-2.jpg"));
    }

    @Test
    void keepsUnderscoredNamesBeforeModelSuffix() {
        assertEquals("八仙_铁拐李", ImportServiceImpl.extractResourceName("八仙_铁拐李_vendor-image-1_hd.png"));
    }

    @Test
    void fallsBackToFirstSegmentWithoutModelSuffix() {
        assertEquals("宝葫芦", ImportServiceImpl.extractResourceName("道具/宝葫芦_最终版.png"));
        assertEquals("戚继光", ImportServiceImpl.extractResourceName("戚继光.png"));
    }
}
