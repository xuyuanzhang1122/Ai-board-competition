package com.ym.ai_story_studio_server.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * StorageProperties 配置属性测试
 *
 * <p>测试存储配置属性的绑定和默认值：
 * <ul>
 *   <li>默认提供商验证</li>
 *   <li>腾讯云COS配置属性绑定</li>
 *   <li>CDN前缀配置</li>
 * </ul>
 *
 * @author Roo (Prometheus)
 * @since 1.0.0
 */
@DisplayName("StorageProperties 配置测试")
class StoragePropertiesTest {

    private final StorageProperties storageProperties = new StorageProperties();

    @BeforeEach
    void setUp() {
        // 手动设置配置属性（模拟Spring Boot配置绑定）
        storageProperties.setProvider("cos");

        StorageProperties.CosConfig cosConfig = new StorageProperties.CosConfig();
        cosConfig.setSecretId("test-secret-id");
        cosConfig.setSecretKey("test-secret-key");
        cosConfig.setRegion("ap-guangzhou");
        cosConfig.setBucket("test-bucket-1250000000");
        cosConfig.setUrlPrefix("https://test-bucket-1250000000.cos.ap-guangzhou.myqcloud.com");

        storageProperties.setCos(cosConfig);
    }

    @Nested
    @DisplayName("默认值测试")
    class DefaultValuesTests {

        @Test
        @DisplayName("验证默认提供商为local")
        void defaultProvider_IsLocal() {
            StorageProperties properties = new StorageProperties();
            assertThat(properties.getProvider()).isEqualTo("local");
        }

        @Test
        @DisplayName("验证COS配置不为null")
        void cosConfig_IsNotNull() {
            StorageProperties properties = new StorageProperties();
            assertThat(properties.getCos()).isNotNull();
        }

        @Test
        @DisplayName("验证本地存储配置不为null")
        void localConfig_IsNotNull() {
            StorageProperties properties = new StorageProperties();
            assertThat(properties.getLocal()).isNotNull();
        }

        @Test
        @DisplayName("COS配置字段默认值")
        void cosConfig_DefaultValues_AreNull() {
            StorageProperties properties = new StorageProperties();
            StorageProperties.CosConfig cosConfig = properties.getCos();

            assertThat(cosConfig.getSecretId()).isNull();
            assertThat(cosConfig.getSecretKey()).isNull();
            assertThat(cosConfig.getRegion()).isNull();
            assertThat(cosConfig.getBucket()).isNull();
            assertThat(cosConfig.getUrlPrefix()).isNull();
        }

        @Test
        @DisplayName("本地存储配置字段默认值")
        void localConfig_DefaultValues() {
            StorageProperties properties = new StorageProperties();
            StorageProperties.LocalConfig localConfig = properties.getLocal();

            assertThat(localConfig.getBasePath()).isEqualTo("./uploads");
            assertThat(localConfig.getUrlPrefix()).isEqualTo("/uploads");
        }
    }

    @Nested
    @DisplayName("配置属性绑定测试")
    class ConfigurationBindingTests {

        @Test
        @DisplayName("验证提供商配置正确绑定")
        void provider_BoundCorrectly() {
            assertThat(storageProperties.getProvider()).isEqualTo("cos");
        }

        @Test
        @DisplayName("验证COS密钥与区域配置正确绑定")
        void cosCredentials_BoundCorrectly() {
            assertThat(storageProperties.getCos().getSecretId()).isEqualTo("test-secret-id");
            assertThat(storageProperties.getCos().getSecretKey()).isEqualTo("test-secret-key");
            assertThat(storageProperties.getCos().getRegion()).isEqualTo("ap-guangzhou");
        }

        @Test
        @DisplayName("验证COS bucket配置正确绑定")
        void cosBucket_BoundCorrectly() {
            assertThat(storageProperties.getCos().getBucket()).isEqualTo("test-bucket-1250000000");
        }

        @Test
        @DisplayName("验证COS urlPrefix配置正确绑定")
        void cosUrlPrefix_BoundCorrectly() {
            assertThat(storageProperties.getCos().getUrlPrefix())
                    .isEqualTo("https://test-bucket-1250000000.cos.ap-guangzhou.myqcloud.com");
        }
    }

    @Nested
    @DisplayName("提供商切换测试")
    class ProviderSwitchTests {

        @Test
        @DisplayName("支持切换到local提供商")
        void switchProvider_ToLocal() {
            storageProperties.setProvider("local");
            assertThat(storageProperties.getProvider()).isEqualTo("local");
        }

        @Test
        @DisplayName("切换提供商不影响COS配置")
        void switchProvider_DoesNotAffectCosConfig() {
            String originalBucket = storageProperties.getCos().getBucket();
            storageProperties.setProvider("local");
            assertThat(storageProperties.getCos().getBucket()).isEqualTo(originalBucket);
        }
    }

    @Nested
    @DisplayName("CDN配置测试")
    class CdnConfigurationTests {

        @Test
        @DisplayName("支持自定义CDN URL前缀")
        void customCdnUrlPrefix() {
            String cdnPrefix = "https://cdn.example.com";
            storageProperties.getCos().setUrlPrefix(cdnPrefix);
            assertThat(storageProperties.getCos().getUrlPrefix()).isEqualTo(cdnPrefix);
        }

        @Test
        @DisplayName("支持空CDN URL前缀（回退默认COS域名）")
        void nullCdnUrlPrefix() {
            storageProperties.getCos().setUrlPrefix(null);
            assertThat(storageProperties.getCos().getUrlPrefix()).isNull();
        }
    }
}
