import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

// 1. 定义基础子模块 Schema
const AttributeSchema = z
  .intersection(
    z.object({
      实力: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      魅力: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      智慧: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      专注: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      学识: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      交流: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      文艺: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      经营: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      手工: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
      家务: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 300))
        .prefault(0),
    }),
    z.record(
      z.string(),
      z.coerce.number().transform(v => _.clamp(v, 0, 300)),
    ),
  )
  .prefault({});

const SkillSchema = z
  .record(
    z.string().describe('技能名称'),
    z
      .object({
        简介: z.string().prefault(''),
        等级: z.coerce.number().prefault(1),
        效果: z.string().prefault(''),
        评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
      })
      .prefault({}),
  )
  .prefault({});

const ItemSchema = z
  .record(
    z.string().describe('物品名称'),
    z
      .object({
        简介: z.string().prefault(''),
        效果: z.string().prefault(''),
        评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
        数量: z.coerce.number().prefault(1),
      })
      .prefault({}),
  )
  .prefault({});

const StatusSchema = z
  .record(
    z.string().describe('状态名称'),
    z
      .object({
        效果: z.string().prefault(''),
        来源: z.string().prefault(''),
        持续时间: z.string().prefault(''),
      })
      .prefault({}),
  )
  .prefault({});

const ClothingSchema = z
  .record(
    z.string().describe('衣物名称'),
    z
      .object({
        穿着部位: z.string().prefault(''),
        穿着情况: z.enum(['穿着', '脱下']).prefault('穿着'),
        破损状态: z.enum(['完好无缺', '轻微破损', '中度破损', '严重破坏']).prefault('完好无缺'),
        外观详情: z.string().describe('客观的衣物整体外观和细节的详细描述，至少20字以上').prefault(''),
        衣物状态: z
          .string()
          .describe('当前的衣物状态是什么样的，如：整洁如新。/打湿，紧贴身体。/大面积破损，勉强挂在腿上')
          .prefault(''),
        评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
      })
      .prefault({}),
  )
  .prefault({});

// 2. 提取共用的基础角色模型 (BaseCharacterSchema)
// 注意：这里作为被 extend 的基类，本身不能调用 .prefault()
const BaseCharacterSchema = z.object({
  属性: AttributeSchema,
  姿态动作: z
    .string()
    .describe('当前从外界来看处于什么样的姿态，正在进行什么样的动作，至少30字以上')
    .prefault('暂无动作'),
  状态: StatusSchema,
  身体状态: z
    .string()
    .describe('透视视角下的客观身体裸体状态，包括整体描述和身材细节，胸型/乳晕与乳头/腰臀/私密区域等，至少50字以上')
    .prefault('暂无描述'),
  当前穿着衣物: ClothingSchema,
  拥有物品: ItemSchema,
  拥有技能: SkillSchema,
});

// 3. 构建完整的顶层 Schema
export const Schema = z.object({
  世界信息: z
    .object({
      当前所处区域名称: z.string().prefault('未知区域'),
      具体位置: z.string().prefault('未知地点'),
      日期: z.string().prefault('X年X月X日'),
      时间: z.string().prefault('00:00'),
      天气: z.string().prefault('晴朗'),
    })
    .prefault({}),

  // {{user}} 继承基础模型，并添加独有字段
  '{{user}}': BaseCharacterSchema.extend({
    位置: z.string().prefault('未知地点'),
    货币: z
      .object({
        金钱: z.coerce.number().prefault(0),
      })
      .prefault({}),
  }).prefault({}),

  // NPC 继承基础模型，并添加独有字段
  NPC: z
    .record(
      z.string().describe('NPC姓名'),
      BaseCharacterSchema.extend({
        身份: z.string().describe('角色在世界观中的主要头衔和职业').prefault(''),
        生日日期: z.string().prefault('未知'),
        基础外貌: z
          .string()
          .describe(
            '极其详细的客观固定特征描述，至少40字以上。包含：整体印象、发型、面部、身材细节（罩杯与胸型/乳晕与乳头/腰臀/私密区域等）、特殊特征。',
          )
          .prefault(''),
        内心想法: z.string().describe('始终以第一人称视角记录，内容长度至少40字。').prefault(''),
        当前情绪状态与心情: z.string().describe('至少三个词语描述当前的情绪状态与心情').prefault('平静'),
        当前本能渴望: z.string().describe('内心深处潜意识渴望作什么').prefault('无'),
        心动值: z.coerce
          .number()
          .transform(v => _.clamp(v, 0, 100))
          .prefault(0),
        兴奋值: z.coerce
          .number()
          .transform(v => _.clamp(v, 0, 100))
          .prefault(0),
        情欲值: z.coerce
          .number()
          .transform(v => _.clamp(v, 0, 100))
          .prefault(0),
        敏感值: z.coerce
          .number()
          .transform(v => _.clamp(v, 0, 100))
          .prefault(0),
        羞耻值: z.coerce
          .number()
          .transform(v => _.clamp(v, 0, 100))
          .prefault(0),
        高潮次数: z.coerce.number().prefault(0),
        被内射次数: z.coerce.number().prefault(0),
        是否在场: z.boolean().prefault(false),
      }).prefault({}),
    )
    .prefault({}),
});

$(() => {
  registerMvuSchema(Schema);
});
