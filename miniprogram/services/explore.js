const { sanitizeText, toneInstruction } = require("./safety");

function getExplorationResponse({ input, records, summary, answers, history }) {
  return wx.cloud
    .callFunction({
      name: "deepseekChat",
      data: {
        allowWebSearch: true,
        responseFormatJson: true,
        webSearchQuery: buildWebSearchQuery(input, records),
        systemPrompt: buildExploreSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildPrompt({ input, records, summary, answers, history }),
          },
        ],
      },
    })
    .then((response) => {
      const reply = response.result && response.result.reply;
      const research = response.result && response.result.research;
      return normalizeExploreContent(reply, input, research);
    });
}

function buildExploreSystemPrompt() {
  return [
    "你是「志愿之外」的人生探索引导者。",
    "你的任务不是安慰用户，也不是替用户做决定，而是帮助用户把理想、现实、兴趣、风险和选择成本讲清楚。",
    "",
    "回答规则：",
    "1. 每次回答必须包含：一个观察、一个现实信息、一个追问。",
    "2. 不要输出空泛鸡汤，不要只说“做自己”“慢慢探索”“专业不是终点”。",
    "3. 不要直接给最终答案，不要上来推荐专业、职业、学校；先追问关键条件。",
    "4. 语言克制、具体、短，不长篇说教。",
    "5. 多用“我看到”“可能”“需要确认”“可以继续拆开看”，少用“你就是”“你一定”“最适合”。",
    "",
    "事实与数据要求：",
    "1. 讨论学校、专业招生、培养方案、学费、录取规则时，优先以学校官网、招生办官网、教育主管部门公开信息为准；如果只能找到媒体报道或第三方整理，必须注明“非官方信息/第三方整理，仅供参考”。",
    "2. 讨论就业、收入、行业、城市、政策、AI影响等数据时，按来源可信度分层使用：第一层是政府部门、统计局、教育部、人社部、学校就业质量报告等官方数据；第二层是权威研究机构、行业协会、官媒或大型招聘平台公开报告；第三层是一般媒体、新闻报道、招聘平台样本或公开讨论。",
    "3. 第三层来源可以用来提供趋势性参考，但必须明确标注“媒体报道/平台样本/第三方整理/公开讨论”，并说明样本、时间、地区或统计口径可能有限。",
    "4. 绝对不要编造学校信息、专业信息、就业数据、薪资、排名、比例、政策、来源、链接或年份。",
    "5. 没有任何来源时，不要给精确数字；如果只有非官方来源，可以给范围或趋势，但要写清来源层级和不确定性。",
    "6. 如果上下文没有提供官网或权威来源原文，不要声称“已查询官网”或“根据某官网”。",
    "7. 如果云函数提供了联网检索资料，只能把它当作候选依据；引用时要看清资料里的原始来源名称或链接。",
    "8. 如果云函数提示联网检索失败或未找到可靠资料，必须承认无法核实，不能补写数据。",
    "9. sources 里如有明确网页来源，必须提供 url 字段；没有明确链接时不要编造 url。",
    "10. 公开资料查询应由你尽量替用户完成，不要把任务推给用户。避免使用“你需要查阅”“建议你去查”“最可靠的路径是查阅官网”这类表达。",
    "11. 只有缺少用户个人条件时才追问用户补充，例如省份、考试年份、选科、分数、位次、城市偏好、目标学校；补充后由你继续查询和整理。",
    "12. 不要使用⚠️、❗等警报符号；无法联网核实时，用平静文字说明。",
    "13. 不要把“联网超时”“搜索工具错误”“云函数错误”“API key”这类技术原因写给用户；只说明这次没有拿到可核验公开资料，并追问还缺什么条件。",
    "",
    "中国高考省份差异规则：",
    "1. 涉及考试分科、选科要求、院校专业组、可报专业、录取规则、学校招生计划时，必须先确认用户所在省/自治区/直辖市、考试年份、首选科目/再选科目或文理科/综合改革类别。",
    "2. 如果缺少这些信息，不要给报考结论；必须在 verification 里标记 needs_user_info，并在最后追问缺失信息。",
    "3. 如果用户描述的分科/选科规则和你掌握的公开规则可能有出入，不要直接下结论；先说明可能存在出入，并向用户确认省份、年份和选科信息。",
    "4. 最终仍要提示以省教育考试院、阳光高考平台、学校本科招生网或学校招生章程为准。",
    "",
    "现实信息呈现要求：",
    "1. 如果信息适合对比，优先使用 table 表格。",
    "2. 如果信息适合展示相对高低、风险强弱或关注度，可以使用 bar 条形图。",
    "3. 表格和图表里的数字必须标注来源层级；官方数据写“官方数据”，权威机构/官媒写清机构或媒体，一般媒体/平台样本写“非官方参考”。",
    "4. 图表只用于提升可读性，不要伪装成精确测评。",
    "5. 在图表或表格之后，必须用 realityPerspective 给 1 到 2 段文字总结，帮助用户理解这些现实信息意味着什么。",
    "6. realityPerspective 不要复述表格，要提供判断视角：哪些信息已经相对清楚、哪些条件会改变结论、下一步需要用户补充什么以便你继续查询。",
    "",
    "输出格式：只输出 JSON，不要输出 Markdown 代码块。",
  ].join("\n");
}

function buildPrompt({ input, records, summary, answers, history }) {
  const context = {
    summary,
    answers,
    recentRecords: (records || []).slice(-6),
    explorationHistory: (history || []).slice(0, 8),
  };

  return [
    "你是「志愿之外」的人生探索访谈师。",
    "产品目标是帮助用户形成判断，而不是提供空泛情绪价值。",
    "每次回答必须包含：1个观察、1个现实信息、1个追问。",
    "现实信息可以讨论：就业、收入、行业、AI影响、未来风险、学习成本、转行成本、城市差异、创业、读研、考公、出国。",
    "现实信息如果适合对比，请使用 realityBlocks 里的 table；如果适合展示相对高低或风险强弱，请使用 realityBlocks 里的 bar。",
    "如果使用了 table 或 bar，必须在 realityPerspective 写 1 到 2 段文字，放在图表之后，稍微总结并提供一个看问题的角度。",
    "realityPerspective 要帮助用户理解数据和现实条件，不要只是重复表格内容。",
    "学校和专业信息优先以官网或教育主管部门公开信息为准；其他数据优先用官方数据，其次可参考权威机构、行业协会、官媒、大型招聘平台报告；再其次可参考一般媒体和新闻，但必须注明来源层级。",
    "遇到不知道或找不到来源的问题，必须明确说不知道或“我这次没有查到可核验资料”。如果只有一般媒体、新闻或平台样本，可以作为趋势参考，但不能编造数字、来源、排名、薪资、比例、政策，也不能说成官方结论。",
    "如果这次没有拿到联网资料，不要对用户说“联网超时”或“搜索失败”，只说“我这次没有拿到可核验公开资料”。",
    "如果上下文没有提供来源原文，不要声称已经查询官网；不要让用户自己去查官网，而是说明还缺哪些目标对象或个人条件，拿到后你可以继续查。",
    "不要说“建议你查阅官网/报告”“最可靠路径是查阅官网”“具体还需自行查询”。改成“我需要你补充xx信息，补充后我可以继续查并帮你整理”。",
    "不要说“自行查证”“自行查询”“自己查证”。不要使用⚠️、❗等警报符号；无法核实时，直接说明原因即可。",
    "涉及高考分科、选科要求、院校专业组、可报专业、招生计划、录取规则时，必须先确认用户的省份、考试年份、首选科目/再选科目或文理科/综合改革类别；缺失时不要下结论，要追问。",
    "如果用户的表述和省份规则可能有出入，必须先提醒存在出入并询问确认，不能把一个省份的规则套到另一个省份。",
    "禁止空泛鸡汤、抽象哲学、连续安慰、只谈理想、只谈现实。",
    "禁止直接推荐专业、直接推荐职业、替用户做决定。",
    "当用户进入专业讨论时，不要直接推荐；先收集兴趣、价值观、风险偏好、城市偏好、收入诉求、家庭影响、学习能力。",
    "收集足够信息后，才能讨论专业利弊、行业现状、未来变化、AI影响、转行可能性。",
    toneInstruction,
    "只输出JSON，不要输出Markdown代码块。",
    "JSON结构必须是：",
    JSON.stringify({
      title: "这次探索的短标题",
      observation: "1个观察",
      reality: "现实信息的短摘要",
      realityBlocks: [
        {
          type: "text",
          text: "普通现实信息段落",
        },
        {
          type: "table",
          title: "可选：对比表标题",
          columns: ["维度", "信息", "核验来源"],
          rows: [["示例维度", "示例信息", "官方数据/权威机构/官媒/媒体报道/平台样本；写清局限"]],
        },
        {
          type: "bar",
          title: "可选：相对风险或关注度",
          unit: "相对高低，不代表官方评分",
          items: [{ label: "示例项", value: 60, note: "说明" }],
        },
        {
          type: "notice",
          text: "可选：不知道或需要核验的说明",
        },
      ],
      realityPerspective: "图表之后的简短总结：这些信息意味着什么、哪些条件会改变判断、还需要用户补充什么以便你继续查询。",
      sources: [
        {
          name: "来源名称，例如学校官网/教育部/国家统计局/人社部/官媒/行业协会/媒体报道/招聘平台报告",
          type: "官方/权威机构/官媒/行业协会/一般媒体/招聘平台/第三方整理",
          note: "具体参考了什么；如果不是官方数据，必须写清样本、口径或仅供趋势参考",
          url: "可选：真实来源链接；没有就留空",
        },
      ],
      verification: {
        status: "not_applicable 或 needs_user_info 或 needs_official_check 或 possible_conflict 或 verified",
        basis: "核验状态说明；没有官网/权威来源原文时不要写已核验",
        requiredFields: ["缺失时写：省份", "考试年份", "选科/科类"],
        conflict: "如果发现用户信息和省份规则可能有出入，在这里说明",
      },
      uncertainty: "可选：哪些信息不能确认，需要用户后续查官网或权威来源",
      question: "1个追问",
      historyTitle: "历史记录标题",
      historySummary: "历史记录摘要",
    }),
    "observation、reality、question都要具体，避免泛泛而谈。",
    "realityBlocks 可少量使用，不要堆砌；如果没有可靠数据，优先输出 notice 和需要核验的维度。",
    `用户刚刚写下：${input}`,
    `已有访谈上下文：${JSON.stringify(context)}`,
  ].join("\n");
}

function buildWebSearchQuery(input, records) {
  const current = sanitizeText(input || "");
  const recentUsers = (records || [])
    .filter((record) => record && record.type === "user" && record.content)
    .slice(-3)
    .map((record) => sanitizeText(record.content))
    .filter(Boolean);
  const pieces = recentUsers.concat(current).filter(Boolean);
  const uniquePieces = pieces.filter((piece, index) => pieces.indexOf(piece) === index);
  const query = uniquePieces.join(" ").trim();

  if (!query) {
    return current;
  }

  return query.length > 140 ? query.slice(query.length - 140) : query;
}

function normalizeExploreContent(reply, input, research) {
  const parsed = parseJson(reply);

  if (parsed) {
    const title = ensureText(parsed.title, "先把问题拆开看");
    const observation = ensureText(parsed.observation, "我看到你似乎正在把兴趣和现实放在一起比较。");
    const reality = rewriteUserResearchBurden(
      ensureText(parsed.reality, "现实里，不同路径的学习成本、就业弹性和转向空间会有明显差异。")
    );
    const question = ensureText(parsed.question, "你更想先比较兴趣、就业、收入，还是未来成长空间？");
    const realityBlocks = normalizeRealityBlocks(parsed.realityBlocks, reality);
    const realityPerspective = rewriteUserResearchBurden(
      ensureText(
        parsed.realityPerspective || parsed.realitySummary || parsed.perspective,
        buildRealityPerspectiveFallback(realityBlocks, reality)
      )
    );
    const sources = normalizeSources(parsed.sources, research);
    const verification = normalizeVerification(parsed.verification);
    const uncertainty = rewriteUserResearchBurden(parsed.uncertainty);

    return {
      title,
      observation,
      reality,
      realityBlocks,
      realityPerspective,
      sources,
      verification,
      uncertainty,
      question,
      historyTitle: ensureText(parsed.historyTitle, title),
      historySummary: ensureText(parsed.historySummary, observation),
    };
  }

  return {
    title: "先把问题拆开看",
    observation: sanitizeText(`我看到你提到「${input}」，这可能不是一个单点问题，而是几个现实条件交织在一起。`),
    reality: "现实里，选择通常会同时受到学习成本、城市机会、收入预期和家庭影响的牵动。",
    realityBlocks: [
      {
        id: "fallback-text",
        type: "text",
        text: "现实里，选择通常会同时受到学习成本、城市机会、收入预期和家庭影响的牵动。",
      },
      {
        id: "fallback-notice",
        type: "notice",
        text: "这次没有拿到可核验的数据来源，所以我不会给具体数字。你可以继续把学校、专业或城市说清楚，我再替你查询并整理。",
      },
    ],
    realityPerspective: "这些现实条件不是为了替你下结论，而是帮你缩小判断范围。如果你补充目标学校、所在省份、考试年份或城市偏好，我可以继续替你查公开资料并整理成更具体的比较。",
    sources: [],
    verification: {
      status: "needs_official_check",
      statusLabel: "需要核验",
      basis: "当前没有可核验的官网或权威来源原文。",
      requiredFields: [],
      conflict: "",
      shouldShow: true,
    },
    uncertainty: "没有可靠来源时，我不会给具体数字；补充目标对象后我可以继续查。",
    question: "如果先选一个维度看，你更想比较兴趣、就业、收入，还是未来成长空间？",
    historyTitle: "一次新的探索",
    historySummary: "围绕一个具体问题，开始拆分现实条件和内心在意。",
  };
}

function buildRealityPerspectiveFallback(blocks, reality) {
  const hasVisualBlock = Array.isArray(blocks) && blocks.some((block) => block && (block.type === "table" || block.type === "bar"));

  if (hasVisualBlock) {
    return "上面的信息更适合当作判断框架，而不是直接结论。接下来如果你补充目标城市、学校层次、学习基础或家庭期待，我可以继续替你查公开资料，并把不同路径整理成更具体的比较。";
  }

  return reality || "这些现实条件可以先作为判断框架。你补充省份、分数、选科、城市偏好和风险承受度后，我可以继续查询并帮你缩小范围。";
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

function ensureText(value, fallback) {
  return sanitizeText(typeof value === "string" && value.trim() ? value.trim() : fallback);
}

function ensureOptionalText(value) {
  return sanitizeText(typeof value === "string" && value.trim() ? value.trim() : "");
}

function normalizeRealityBlocks(blocks, fallbackText) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return [
      {
        id: "reality-text",
        type: "text",
        text: fallbackText,
      },
    ];
  }

  const normalized = blocks
    .map((block, index) => {
      if (!block || typeof block !== "object") {
        return null;
      }

      if (block.type === "table") {
        const columns = normalizeStringArray(block.columns).slice(0, 4);
        const rows = Array.isArray(block.rows)
          ? block.rows
              .map((row) => normalizeStringArray(row).slice(0, columns.length || 4))
              .filter((row) => row.length)
              .slice(0, 6)
          : [];

        if (!columns.length || !rows.length) {
          return null;
        }

        return {
          id: `table-${index}`,
          type: "table",
          title: ensureOptionalText(block.title),
          columns,
          rows,
        };
      }

      if (block.type === "bar") {
        const items = Array.isArray(block.items)
          ? block.items
              .map((item) => {
                if (!item || typeof item !== "object") {
                  return null;
                }

                const label = ensureOptionalText(item.label);
                const value = clampPercent(Number(item.value));

                if (!label) {
                  return null;
                }

                return {
                  id: `bar-${index}-${label}`,
                  label,
                  value,
                  width: `${value}%`,
                  note: ensureOptionalText(item.note),
                };
              })
              .filter(Boolean)
              .slice(0, 5)
          : [];

        if (!items.length) {
          return null;
        }

        return {
          id: `bar-${index}`,
          type: "bar",
          title: ensureOptionalText(block.title),
          unit: ensureOptionalText(block.unit),
          items,
        };
      }

      if (block.type === "notice") {
        const text = ensureOptionalText(block.text);
        return text ? { id: `notice-${index}`, type: "notice", text: rewriteUserResearchBurden(text) } : null;
      }

      const text = ensureOptionalText(block.text || block.content);
      return text ? { id: `text-${index}`, type: "text", text: rewriteUserResearchBurden(text) } : null;
    })
    .filter(Boolean)
    .slice(0, 5);

  return normalized.length
    ? normalized
    : [
        {
          id: "reality-text",
          type: "text",
          text: fallbackText,
        },
      ];
}

function normalizeSources(sources, research) {
  if (!research || research.status !== "ok") {
    return [];
  }

  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .map((source) => {
      if (!source || typeof source !== "object") {
        return null;
      }

      const name = ensureOptionalText(source.name);

      if (!name) {
        return null;
      }

      return {
        name,
        type: ensureOptionalText(source.type),
        note: ensureOptionalText(source.note),
        url: normalizeUrl(source.url || source.link || source.href),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";

  if (!/^https?:\/\//i.test(url)) {
    return "";
  }

  return sanitizeText(url);
}

function normalizeVerification(verification) {
  if (!verification || typeof verification !== "object") {
    return {
      status: "not_applicable",
      statusLabel: "",
      basis: "",
      requiredFields: [],
      conflict: "",
      shouldShow: false,
    };
  }

  const allowedStatuses = {
    verified: "已核验",
    needs_user_info: "还需要补充信息",
    needs_official_check: "需要官网核验",
    possible_conflict: "规则可能有出入",
    not_applicable: "",
  };
  const status = Object.prototype.hasOwnProperty.call(allowedStatuses, verification.status)
    ? verification.status
    : "needs_official_check";
  const requiredFields = normalizeStringArray(verification.requiredFields).slice(0, 5);
  const basis = buildVerificationBasis(status, requiredFields, verification.basis);
  const conflict = ensureOptionalText(verification.conflict);

  return {
    status,
    statusLabel: allowedStatuses[status],
    basis,
    requiredFields,
    conflict,
    shouldShow: status !== "not_applicable" && !!(allowedStatuses[status] || basis || requiredFields.length || conflict),
  };
}

function buildVerificationBasis(status, requiredFields, rawBasis) {
  const basis = ensureOptionalText(rawBasis);

  if (status !== "needs_user_info") {
    return rewriteUserResearchBurden(basis);
  }

  if (requiredFields && requiredFields.length) {
    return `你还没有提供${requiredFields.join("、")}。这些信息会影响报考规则、可选范围和判断依据；补充完整后，我可以继续替你查询公开资料，并更具体地帮你比较学校、专业和现实风险。`;
  }

  return rewriteUserResearchBurden(basis) || "你还有一些关键信息没有说清。把背景补充完整后，我可以继续替你查询公开资料，并更具体地帮你拆解现实条件和选择成本。";
}

function rewriteUserResearchBurden(text) {
  const content = ensureOptionalText(text);

  if (!content) {
    return "";
  }

  return content
    .replace(/[⚠️❗！]+/g, "")
    .replace(/我这次联网检索再次超时/g, "我这次没有拿到可核验公开资料")
    .replace(/本次联网检索超时/g, "这次没有拿到可核验公开资料")
    .replace(/联网检索再次?超时/g, "这次没有拿到可核验公开资料")
    .replace(/联网超时/g, "没有拿到可核验公开资料")
    .replace(/搜索工具错误/g, "资料暂时不可用")
    .replace(/云函数错误/g, "资料暂时不可用")
    .replace(/API key/g, "资料来源")
    .replace(/建议后续通过以下渠道自行查证[:：]?/g, "我这次没有查到可核验资料。你补充更具体的目标对象后，我可以继续替你查询并整理：")
    .replace(/建议后续通过(.+?)自行查证/g, "我可以在你补充更具体目标后继续核验")
    .replace(/自行查证/g, "由我继续核验")
    .replace(/自行查询/g, "由我继续查询")
    .replace(/自己查证/g, "由我继续核验")
    .replace(/自己查询/g, "由我继续查询")
    .replace(/你可以自行/g, "我可以继续")
    .replace(/建议你?查阅/g, "我需要继续核验")
    .replace(/你需要查阅/g, "我需要继续核验")
    .replace(/需自行查询/g, "我需要继续核验")
    .replace(/需要自行查询/g, "我需要继续核验")
    .replace(/最可靠的路径是[:：]?\s*查阅/g, "更可靠的做法是由我继续核验")
    .replace(/最可靠的做法是[:：]?\s*查阅/g, "更可靠的做法是由我继续核验")
    .replace(/具体还需查阅/g, "具体还需要我继续核验")
    .replace(/仍需官网\/权威来源核验/g, "我还需要更多目标信息才能继续用官网或权威来源核验");
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeText(item == null ? "" : String(item).trim()))
    .filter(Boolean);
}

function clampPercent(value) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = {
  getExplorationResponse,
};
