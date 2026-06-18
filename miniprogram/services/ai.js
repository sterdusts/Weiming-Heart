const { sanitizeText, toneInstruction } = require("./safety");

function getReflection({ question, answer, answers }) {
  const recentAnswers = answers
    .slice(-4)
    .map((item, index) => `${index + 1}. ${item.title}: ${item.answer}`)
    .join("\n");

  return wx.cloud
    .callFunction({
      name: "deepseekChat",
      data: {
        messages: [
          {
            role: "user",
            content: [
              "请为高考后的学生生成一句问卷反馈。",
              "要求：10到30个中文字符，温暖、陪伴、引导。",
              "不要推荐学校或专业，不要分析，不要说教，不要输出多句，不要使用编号。",
              toneInstruction,
              `当前问题：${question.title}`,
              `用户回答：${answer}`,
              `已记录回答：\n${recentAnswers}`,
            ].join("\n"),
          },
        ],
      },
    })
    .then((response) => {
      const reply = response.result && response.result.reply;

      return {
        reflection: normalizeReflection(reply),
      };
    });
}

function normalizeReflection(text) {
  if (!text || typeof text !== "string") {
    return "你愿意写下这些，已经是在靠近自己。";
  }

  return sanitizeText(text)
    .replace(/\s+/g, "")
    .replace(/^["“]|["”]$/g, "")
    .slice(0, 30);
}

module.exports = {
  getReflection,
};
