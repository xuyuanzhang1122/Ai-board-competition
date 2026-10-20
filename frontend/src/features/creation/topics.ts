import type { Brief, Source } from './types'

export interface StoryTopic {
  id: string
  kind: '民间传说' | '历史演绎' | '诗意改编'
  materials: string
  sources: Source[]
  summary: string
  theme: string
  title: string
}

const culture: Source = {
  id: 'penglai_culture',
  title: '蓬莱区人民政府：历史文化',
  url: 'https://www.penglai.gov.cn/art/2020/6/16/art_13313_975837.html',
  license: '2026-10-20 查阅，仅提炼地方文化背景；网页图片、音视频未纳入素材。',
}

export const STORY_TOPICS: readonly StoryTopic[] = [
  {
    id: 'eight-immortals',
    title: '八仙过海',
    kind: '民间传说',
    summary: '从蓬莱海岸出发，讲一段各显本领、合力渡海的故事。',
    theme: '参赛短片《八仙过海》：以蓬莱海岸为起点，改编八仙各显本领、合力渡海的民间传说',
    materials:
      '题材性质：民间传说改编，不是历史事件复原。地方文化资料将八仙过海作为蓬莱神话传说介绍。\n' +
      '创作方向：30 秒、4 个镜头，按“海岸相聚—各显本领—合力渡浪—远望蓬莱”展开，采用国风奇幻画面。八仙可以群像呈现，聚焦两位角色推动情节，避免逐一介绍拖慢节奏。对白与合作情节为本片原创演绎。\n' +
      '剧本开头及分镜复核项写明“民间传说改编”。不要照搬影视剧台词、音乐或造型。无需分析受众、渠道、营销转化或商业目标。',
    sources: [culture],
  },
  {
    id: 'qi-jiguang',
    title: '戚继光·蓬莱练兵',
    kind: '历史演绎',
    summary: '以山东海防为背景，聚焦一次训练和守护家园的决心。',
    theme: '参赛短片《海防少年志》：以戚继光在蓬莱参与山东海防为背景，艺术演绎一段练兵故事',
    materials:
      '已查阅背景：烟台市人民政府资料记载，戚继光曾于 1553—1555 年坐镇蓬莱、备倭山东；蓬莱区官方介绍提及戚继光练兵抗倭的地方文化。\n' +
      '创作方向：30 秒、4 个镜头，按“海风与号令—士兵训练受挫—重新协作—守望海岸”展开。可设置一名虚构年轻士兵作为视角人物，训练细节与人物对白均属艺术演绎，不冒充史料原话。\n' +
      '剧本开头及分镜复核项写明“历史背景下的艺术演绎”。不要把闽浙战役移到蓬莱，不要宣称本片复原了某次有据可查的战斗；不用未经资料支持的具体阵法、服饰考据或战果数字。无需营销与受众分析。',
    sources: [
      {
        id: 'qi_shandong_defense',
        title: '烟台市人民政府：传承红色精神，弘扬历史文化',
        url: 'https://www.yantai.gov.cn/art/2019/11/27/art_12809_2562163.html',
        license: '2026-10-20 查阅，提炼戚继光在蓬莱备倭山东的背景；不使用页面图片。',
      },
      {
        id: 'penglai_city',
        title: '蓬莱区人民政府：城市介绍',
        url: 'https://www.penglai.gov.cn/col/col13309/',
        license: '2026-10-20 查阅，提炼蓬莱地方文化背景；训练场景与对白另作艺术演绎。',
      },
    ],
  },
  {
    id: 'su-shi',
    title: '苏轼·登州海市',
    kind: '诗意改编',
    summary: '让海雾、楼影和诗句交织，呈现登州海市的诗意想象。',
    theme: '参赛短片《东坡望海》：从苏轼《海市（并叙）》出发，诗意改编登州海市故事',
    materials:
      '文本依据：苏轼《海市（并叙）》自叙曾在登州任职，并以海市景象入诗。地方文化资料也将苏轼诗文与蓬莱海市文化联系起来。\n' +
      '创作方向：30 秒、4 个镜头，按“临海远望—雾中楼影—提笔成诗—海天留白”展开。只引用古诗短句“东方云海空复空，群仙出没空明中”，其余旁白原创；注明作者苏轼、篇名《海市（并叙）》。\n' +
      '定位为诗意改编，内心独白与画面细节是创作想象。诗序所叙祈祷与见海市不作为神迹得到证实的结论；不要把诗中群仙意象当作真实存在。无需受众、渠道或商业目标分析。',
    sources: [
      {
        id: 'su_shi_haishi',
        title: '苏轼《海市（並敘）》原文（维基文库）',
        url: 'https://zh.wikisource.org/wiki/海市（並敘）',
        license: '2026-10-20 查阅古诗原文，仅引用注明作者篇名的古诗短句，不使用页面配图与现代译文。',
      },
      culture,
    ],
  },
]

/** Each selection owns its sources; editing one brief cannot mutate another preset. */
export function briefFromTopic(topic: StoryTopic): Brief {
  return {
    theme: topic.theme,
    audience: '',
    channel: '',
    goal: '',
    duration: 30,
    aspectRatio: '16:9',
    materials: topic.materials,
    sources: topic.sources.map((source) => ({ ...source })),
  }
}
