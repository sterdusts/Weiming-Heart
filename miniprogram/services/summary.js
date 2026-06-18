const { sanitizeCard, sanitizeText, toneInstruction } = require("./safety");

const RADAR_DIMENSIONS = ["创造", "成长", "自由", "稳定", "理想", "现实"];
const PLACEHOLDER_PATTERN = /^(暂未填写|未知|未确定|不确定|不知道|暂未考虑|没想好|还没想好|无|没有|暂无|空|none|null|undefined)$/i;

const fallbackCard = {
  mainKeyword: "现实理想家",
  subtitle: "现实为底，理想为灯",
  subKeywords: "现实考量 · 理想驱动 · 成长探索",
  targetSchool: "",
  targetMajor: "",
  majorMatchConfidence: 0,
  radar: [
    { name: "创造", value: 70 },
    { name: "成长", value: 84 },
    { name: "自由", value: 72 },
    { name: "稳定", value: 64 },
    { name: "理想", value: 78 },
    { name: "现实", value: 76 },
  ],
  conclusion: "你似乎希望在现实的基础上，为理想留出空间；这不意味着放弃现实，而是在寻找二者共存的方式。",
};

function getInterviewSummary(answers) {
  const normalizedAnswers = normalizeAnswers(answers);

  if (!normalizedAnswers.length) {
    return Promise.resolve({
      summary: buildSummaryFromCard(fallbackCard),
    });
  }

  return wx.cloud
    .callFunction({
      name: "deepseekChat",
      data: {
        systemPrompt: buildSummarySystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildSummaryPrompt(normalizedAnswers),
          },
        ],
      },
    })
    .then((response) => {
      const reply = response.result && response.result.reply;
      const parsedCard = parseSummaryCard(reply);
      const card = parsedCard
        ? refineGenericKeyword(parsedCard, normalizedAnswers)
        : buildFallbackCard(normalizedAnswers);

      return {
        summary: buildSummaryFromCard(card),
      };
    });
}

function refineGenericKeyword(card, answers) {
  const genericKeywords = ["现实理想家", "自由探索者", "平衡探索者", "现实思考者", "理想探索者"];

  if (!genericKeywords.includes(card.mainKeyword)) {
    return card;
  }

  const profile = extractAnswerProfile(answers);
  const tradeoff = typeof profile.tradeoffValue === "number" ? profile.tradeoffValue : 50;
  const refinedKeyword = inferFallbackKeyword(profile, tradeoff);

  return {
    ...card,
    mainKeyword: refinedKeyword,
  };
}

function buildSummarySystemPrompt() {
  return [
    "你是「志愿之外」的人生探索卡生成器。",
    "你的任务是根据用户的结构化问卷，生成一张高度定制的探索卡，而不是复用模板。",
    "必须严格输出 JSON，不要输出 Markdown，不要输出解释。",
    "不要直接推荐学校或专业，不要替用户做决定。",
    "不要编造学校信息、专业信息、就业数据。",
    "文字要克制、具体、有观察感，不要像 MBTI、心理测试或营销报告。",
  ].join("\n");
}

function buildSummaryPrompt(answers) {
  const future = extractFutureIntentions(answers);

  return [
    "请根据下面这名用户的问卷回答，实时生成一张专属人生探索卡。",
    "每个字段都必须从用户输入中推导，不要套用固定画像，不要总是输出“现实理想家”。",
    "mainKeyword 必须定制：从用户的在意项、担心项、理想现实取向、大学期待中提炼。",
    "mainKeyword 可以是原创短语，4到8个中文字符，例如“稳健试探者”“城市成长型”“兴趣校准者”“现实求索者”“边界确认者”等，但不要直接照抄这些示例。",
    "subKeywords 必须使用3个短语，用「 · 」连接，每个短语2到6个中文字符，必须对应用户真实回答。",
    "radar 数值必须根据用户回答拉开差异，不要输出默认均衡图。",
    "conclusion 必须综合六题回答，70到110字，指出一个具体矛盾或选择线索。",
    "不要直接推荐学校，不要直接推荐专业，不要替用户做决定。",
    "不要编造学校信息、专业信息、就业数据。",
    "如果用户填写了学校、专业、城市，只能作为理解其倾向的线索，不要展开成推荐清单。",
    "如果用户填写了学校和专业，请判断该学校是否存在与用户专业输入高度相近的专业。",
    "只有匹配度达到80%以上，targetMajor才输出该学校对应的规范专业名称，majorMatchConfidence输出80到100。",
    "如果无法确认该学校有相近专业，或匹配度不足80，targetMajor必须输出空字符串，majorMatchConfidence输出0到79。",
    "如果用户没有填写学校、只填写了专业，请把用户输入转换成更正式的专业叫法后输出到targetMajor，majorMatchConfidence输出100；不要伪装成某个学校的专业。",
    "如果用户填写了学校，targetSchool输出用户填写的学校名称；如果没有填写则输出空字符串。",
    "雷达图表示当前内心关注度或人生倾向，不是能力评分，不是专业推荐。",
    toneInstruction,
    "只输出JSON，不要输出Markdown代码块，不要输出额外解释。",
    "JSON结构必须包含这些字段：mainKeyword、subtitle、subKeywords、targetSchool、targetMajor、majorMatchConfidence、radar、conclusion。",
    "subtitle固定输出：现实为底，理想为灯。",
    "targetSchool输出用户填写的学校或空字符串。",
    "targetMajor输出规范专业名称或空字符串。",
    "majorMatchConfidence输出0到100整数。",
    "radar必须是数组，包含6个对象，每个对象包含name和value。",
    "radar维度必须固定为：创造、成长、自由、稳定、理想、现实。不要使用影响力。",
    "radar value使用40到95之间的整数，最高维和最低维至少相差15。",
    "conclusion不要说教，不要鸡汤，不制造焦虑，不要出现“你适合/你应该”。",
    "conclusion使用观察式表达，例如“你似乎……”“这不意味着……而是在……”。",
    `用户学校和专业输入：${JSON.stringify(future)}`,
    `问卷回答：${JSON.stringify(answers)}`,
  ].join("\n");
}

function parseSummaryCard(text) {
  const data = parseJson(text);

  if (!data) {
    return null;
  }

  return normalizeCard(data);
}

function normalizeCard(card) {
  return sanitizeCard({
    mainKeyword: normalizeText(card.mainKeyword) || fallbackCard.mainKeyword,
    subtitle: normalizeText(card.subtitle) || fallbackCard.subtitle,
    subKeywords: normalizeSubKeywords(card.subKeywords, card.tags) || fallbackCard.subKeywords,
    targetSchool: normalizeText(card.targetSchool),
    targetMajor: normalizeText(card.targetMajor),
    majorMatchConfidence: clamp(Math.round(Number(card.majorMatchConfidence) || 0), 0, 100),
    radar: normalizeRadar(card.radar),
    conclusion: normalizeText(card.conclusion) || fallbackCard.conclusion,
  });
}

function buildSummaryFromCard(card) {
  const normalizedCard = normalizeCard(card);
  const keywords = normalizedCard.subKeywords.split(" · ").filter(Boolean);

  return {
    card: normalizedCard,
    values: keywords,
    interests: keywords.slice(0, 3),
    growth: normalizedCard.radar
      .filter((item) => item.value >= 70)
      .slice(0, 3)
      .map((item) => item.name),
    conclusion: normalizedCard.conclusion,
  };
}

function buildFallbackCard(answers) {
  const profile = extractAnswerProfile(answers);
  const values = profile.values.slice(0, 3).join("、") || "成长、现实与自我确认";
  const concerns = profile.concerns.slice(0, 3).join("、") || "未来不确定和选择代价";
  const tradeoff = typeof profile.tradeoffValue === "number" ? profile.tradeoffValue : 50;
  const reality = clamp(50 + Math.round((tradeoff - 50) * 0.6), 40, 92);
  const ideal = clamp(90 - Math.round(tradeoff * 0.45), 40, 92);
  const stability = profile.values.includes("稳定") || profile.concerns.length ? 72 : 58;
  const freedom = profile.values.includes("工作自由度") || profile.values.includes("城市机会") ? 78 : 68;
  const growth = profile.values.includes("成长空间") || profile.universityExpectations.includes("专业能力") ? 84 : 74;
  const creativity = profile.values.includes("兴趣") || profile.universityExpectations.includes("探索兴趣") ? 78 : 66;

  return {
    mainKeyword: inferFallbackKeyword(profile, tradeoff),
    subtitle: "现实为底，理想为灯",
    subKeywords: [profile.values[0] || "现实考量", profile.values[1] || "理想驱动", profile.universityExpectations[0] || "成长探索"]
      .map((item) => normalizeShortTag(item))
      .filter(Boolean)
      .slice(0, 3)
      .join(" · "),
    targetSchool: profile.targetSchool,
    targetMajor: profile.targetSchool ? "" : profile.targetMajor,
    majorMatchConfidence: profile.targetSchool && profile.targetMajor ? 0 : profile.targetMajor ? 100 : 0,
    radar: [
      { name: "创造", value: creativity },
      { name: "成长", value: growth },
      { name: "自由", value: freedom },
      { name: "稳定", value: stability },
      { name: "理想", value: ideal },
      { name: "现实", value: reality },
    ],
    conclusion: `你似乎更在意${values}，同时也在担心${concerns}。这次选择真正需要比较的，不只是学校或专业名称，而是哪一种现实代价你更愿意承担。`,
  };
}

function inferFallbackKeyword(profile, tradeoff) {
  if (profile.values.includes("城市机会")) {
    return "城市试探者";
  }

  if (profile.values.includes("兴趣") && profile.values.includes("成长空间")) {
    return "兴趣成长型";
  }

  if (profile.concerns.includes("选错专业") || profile.concerns.includes("未来后悔")) {
    return "谨慎校准者";
  }

  if (profile.values.includes("稳定") || profile.values.includes("收入")) {
    return tradeoff >= 55 ? "稳健前行者" : "稳定求索者";
  }

  if (profile.values.includes("工作自由度")) {
    return "自由边界者";
  }

  if (profile.universityExpectations.includes("更大的世界") || profile.universityExpectations.includes("出国深造")) {
    return "广阔探索者";
  }

  if (tradeoff >= 75) {
    return "现实规划者";
  }

  if (tradeoff <= 25) {
    return "理想牵引者";
  }

  return "平衡探索者";
}

function extractAnswerProfile(answers) {
  const profile = {
    targetSchool: "",
    targetMajor: "",
    values: [],
    concerns: [],
    tradeoffValue: null,
    universityExpectations: [],
  };

  answers.forEach((item) => {
    const details = item.details || {};

    if (item.id === "future") {
      profile.targetSchool = normalizeText(details.targetSchool);
      profile.targetMajor = normalizeText(details.targetMajor);
    }

    if (item.id === "values") {
      profile.values = normalizeStringArray(details.selected);
    }

    if (item.id === "concerns") {
      profile.concerns = normalizeStringArray(details.selected);
    }

    if (item.id === "tradeoff") {
      const value = Number(details.value);
      profile.tradeoffValue = Number.isNaN(value) ? null : clamp(Math.round(value), 0, 100);
    }

    if (item.id === "university") {
      profile.universityExpectations = normalizeStringArray(details.selected);
    }
  });

  return profile;
}

function extractFutureIntentions(answers) {
  const futureAnswer = answers.find((item) => item && item.id === "future");
  const details = futureAnswer && futureAnswer.details ? futureAnswer.details : {};

  return {
    targetSchool: normalizeText(details.targetSchool),
    targetMajor: normalizeText(details.targetMajor),
  };
}

function parseJson(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeAnswers(answers) {
  if (!Array.isArray(answers)) {
    return [];
  }

  return answers
    .filter((item) => item && item.id && item.title && (item.answer || hasDetails(item.details)))
    .map((item) => ({
      id: String(item.id),
      title: String(item.title),
      answer: normalizeText(item.answer),
      details: normalizeDetails(item.details),
    }))
    .slice(0, 6);
}

function normalizeDetails(details) {
  if (!details || typeof details !== "object") {
    return {};
  }

  return Object.keys(details).reduce((result, key) => {
    const value = details[key];

    if (Array.isArray(value)) {
      const list = normalizeStringArray(value);

      if (list.length) {
        result[key] = list;
      }
      return result;
    }

    if (typeof value === "number") {
      result[key] = value;
      return result;
    }

    const text = normalizeText(value);

    if (isMeaningfulText(text)) {
      result[key] = text;
    }

    return result;
  }, {});
}

function hasDetails(details) {
  return details && typeof details === "object" && Object.keys(normalizeDetails(details)).length > 0;
}

function normalizeSubKeywords(subKeywords, tags) {
  if (typeof subKeywords === "string" && subKeywords.trim()) {
    return subKeywords
      .split("·")
      .map((item) => sanitizeText(item.trim()))
      .filter(isMeaningfulText)
      .slice(0, 3)
      .join(" · ");
  }

  if (Array.isArray(tags) && tags.length) {
    return tags
      .filter((tag) => typeof tag === "string" && tag.trim())
      .map((tag) => sanitizeText(tag.trim()))
      .filter(isMeaningfulText)
      .slice(0, 3)
      .join(" · ");
  }

  return "";
}

function normalizeRadar(radar) {
  const source = Array.isArray(radar) ? radar : [];

  return RADAR_DIMENSIONS.map((name) => {
    const matched = source.find((item) => item && item.name === name);
    const fallback = fallbackCard.radar.find((item) => item.name === name);
    const value = matched ? Number(matched.value) : fallback.value;

    return {
      name,
      value: clamp(Math.round(value), 40, 95),
    };
  });
}

function normalizeStringArray(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => normalizeText(item))
    .filter(isMeaningfulText);
}

function normalizeShortTag(text) {
  const tag = normalizeText(text);

  if (!tag) {
    return "";
  }

  return tag.length > 6 ? tag.slice(0, 6) : tag;
}

function normalizeText(text) {
  return sanitizeText(typeof text === "string" || typeof text === "number" ? String(text).trim() : "");
}

function isMeaningfulText(text) {
  return Boolean(text && !PLACEHOLDER_PATTERN.test(String(text).trim()));
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

module.exports = {
  RADAR_DIMENSIONS,
  getInterviewSummary,
};
