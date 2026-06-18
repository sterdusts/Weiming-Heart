# 未鸣之心

[查看中文](README.md) · [View English](README.en.md) · [下载中文 Markdown](README.md?raw=1) · [Download English Markdown](README.en.md?raw=1)

志愿之外 / 知我者 是一个面向高考后学生的 AI 访谈式人生方向探索微信小程序。

它不是传统志愿填报工具，不提供院校分数线、录取概率、专业排名，也不做“AI 张雪峰”。项目目标是在填报志愿前，帮助学生整理自己对专业、城市、大学、现实条件和未来方向的理解。

## 核心理念

现实为底，理想为灯。

不替用户做决定，而是帮助用户看清楚自己为什么选择。

## 产品原则

- 不制造焦虑
- 不灌输标准答案
- 不把就业作为唯一标准
- 不回避现实问题
- 不说教
- 不鸡汤
- 不把所有问题都导向高考分数
- 保留“人生探索”的感觉
- 以高考为主干，但不做成普通志愿填报工具

## 核心流程

当前主要由 6 张问题卡片组成：

1. 我现在站在哪里？
2. 我对未来有什么初步想法？
3. 我更在意什么？
4. 我最担心什么？
5. 当理想与现实发生冲突时
6. 我希望大学带给我什么？

## 结果页要求

结果页需要生成：

- 个性化总结
- 几个贴合用户表达的标签
- 对专业、城市、大学期待的整理
- 对现实风险的提醒
- 后续可以继续思考的问题

标签不要写死，应尽量由 AI 根据用户回答生成。可以参考但不限于：

- 理想探索型
- 稳健成长型
- 城市驱动型
- 兴趣优先型
- 机会捕捉型

## 文案风格

中文，克制，清楚，有陪伴感。

不要像心理测试，不要像升学机构广告，不要像鸡汤公众号。每句话都要尽量有信息量，避免空泛的车轱辘话。

## 开源安全说明

这个仓库已经按开源前的安全要求做了基础清理：

- 不在代码里写死 API Key。
- DeepSeek API Key 从云函数环境变量 `DEEPSEEK_API_KEY` 读取。
- `project.config.json` 中的真实小程序 appid 已替换为 `touristappid`。
- `.gitignore` 已忽略 `project.private.config.json`、`.env`、证书/私钥文件、依赖目录、构建缓存和生产小程序码。
- 不提交真实用户数据、云函数密钥、数据库导出或付费逻辑。
- 开源版本应只保留 demo prompt；如果后续加入生产 prompt、商业规则或付费逻辑，请放在私有配置或私有分支中。

如果某些安全隐患不能通过代码改造解决，应通过 `.gitignore` 排除，并在文档里说明后来人需要自行补充。

## 使用前需要补充

后来人 clone 仓库后，需要补充这些内容才能正常运行：

1. 在微信开发者工具中导入项目，并把 `project.config.json` 里的 `appid` 从 `touristappid` 改成自己的小程序 appid。
2. 在微信云开发中部署 `cloudfunctions/deepseekChat` 和 `cloudfunctions/chatStore`。
3. 给 `deepseekChat` 云函数配置环境变量：
   - `DEEPSEEK_API_KEY`：必填，自己的 DeepSeek API Key。
   - `JINA_API_KEY`：可选，用于联网检索能力；不填时基础 AI 访谈仍可运行。
   - `DEEPSEEK_TIMEOUT`、`SEARCH_TIMEOUT`、`SEARCH_RESULT_LIMIT`：可选，默认值见 `.env.example`。
4. 在云数据库中准备 `chat_sessions` 集合。建议只通过云函数读写，不要把集合开放为公开读写。
5. 如果需要生成带二维码的分享卡，请自行放入 `miniprogram/assets/mini-code.jpg`。这个文件默认被忽略，避免把生产小程序码直接发布到 GitHub。
6. 如果接入真实支付、会员、投放、统计或运营配置，请把相关逻辑和密钥放在私有仓库或部署环境中，不要提交到开源仓库。

## 目录结构

```text
miniprogram/
  app.js
  app.json
  pages/
  services/
  assets/

cloudfunctions/
  deepseekChat/
  chatStore/

project.config.json
.env.example
```

## 不要提交

- 真实 API Key、`.env`、证书或私钥。
- `project.private.config.json`。
- 云数据库导出的用户聊天记录、openid、手机号、分数、位次等个人数据。
- 生产环境的小程序码，除非你明确希望仓库访问者扫码进入你的线上小程序。
- 付费逻辑、商业配置、生产 prompt 或内部运营策略。

## 许可证

当前仓库尚未指定开源许可证。正式公开前，建议补充 `LICENSE` 文件，例如 MIT、Apache-2.0 或其他适合你的许可证。
