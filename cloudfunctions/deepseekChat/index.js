const https = require("https");

const DEEPSEEK_HOST = "api.deepseek.com";
const DEEPSEEK_PATH = "/chat/completions";
const MODEL = "deepseek-v4-flash";
const DEEPSEEK_TIMEOUT = Number(process.env.DEEPSEEK_TIMEOUT || 180000);
const SEARCH_HOST = "s.jina.ai";
const SEARCH_TIMEOUT = Number(process.env.SEARCH_TIMEOUT || 15000);
const SEARCH_RESULT_LIMIT = Number(process.env.SEARCH_RESULT_LIMIT || 5000);
const SEARCH_CACHE_TTL = 1000 * 60 * 30;
const SEARCH_CACHE_LIMIT = 40;
const searchCache = new Map();

exports.main = async (event) => {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY environment variable.");
  }

  const messages = normalizeMessages(event && event.messages);

  if (messages.length === 0) {
    throw new Error("No valid user message provided.");
  }

  const research = await getResearchContext(event, messages);
  const systemPrompt = normalizeSystemPrompt(event && event.systemPrompt);
  const payload = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: research.prompt
          ? `${systemPrompt}\n\n${research.prompt}`
          : systemPrompt,
      },
      ...messages,
    ],
    ...(event && event.responseFormatJson
      ? {
          response_format: {
            type: "json_object",
          },
        }
      : {}),
    temperature: 0.7,
  };
  const data = await requestDeepSeekWithFormatFallback(apiKey, payload);

  const reply =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  return {
    reply: cleanReply(reply || ""),
    research: research.meta,
    usage: data.usage || null,
  };
};

function normalizeSystemPrompt(systemPrompt) {
  if (typeof systemPrompt === "string" && systemPrompt.trim()) {
    return systemPrompt.trim();
  }

  return [
    "你是「志愿之外」的探索引导者。",
    "",
    "你的任务不是帮用户填报志愿，也不是替用户做决定。",
    "你的任务是帮助用户在高考、专业、学校、城市、就业、理想与现实之间建立更清晰的认知。",
    "",
    "不要直接推荐学校。",
    "不要直接推荐专业。",
    "不要根据刻板印象下结论。",
    "不要说：“你适合XXX专业”“你应该去XXX学校”。",
    "涉及数据的，使用图表和表格给用户呈现，提高可读性",
    "回答风格：真诚、克制、有温度、不说教、不鸡汤、不制造焦虑、不使用营销语言、不夸张。",
    "如果用户的信息不足，请明确说明不确定性。",
    "不要编造学校信息。",
    "不要编造专业信息。",
    "不要编造就业数据。",
    "涉及中国高考考试分科、选科要求、院校专业组、可报专业、招生计划或录取规则时，必须先确认用户所在省/自治区/直辖市、考试年份、首选科目/再选科目或文理科/综合改革类别。",
    "如果缺少省份、年份、选科/科类信息，不要按全国统一规则回答；应先追问。",
    "如果用户描述的分科规则和公开规则可能有出入，先提示可能存在出入并请用户确认，不要直接下结论。",
    "涉及学校、专业招生、培养方案、学费、录取规则时，优先以学校官网、招生办官网、教育主管部门公开信息为准；如果只能找到媒体报道或第三方整理，必须注明“非官方信息/第三方整理，仅供参考”。",
    "涉及就业、收入、行业规模、城市、政策等数据时，按来源可信度分层使用：第一层是政府部门、统计局、教育部、人社部、学校就业质量报告等官方数据；第二层是权威研究机构、行业协会、官媒或大型招聘平台公开报告；第三层是一般媒体、新闻报道、招聘平台样本或公开讨论。第三层可以作为参考，但必须明确标注来源类型、样本局限和不确定性。",
    "不要伪造来源、链接、年份、百分比、薪资、排名或政策细节。",
    "如果上下文没有提供官网或权威来源原文，不要声称已经查询官网或引用了某个具体来源。",
    "如果系统消息提供了联网检索资料，只能把资料当作候选依据；引用时必须对应到资料里的原始来源名称或链接。",
    "如果联网检索失败、没有结果或结果无法核验，必须说明无法核实，不要补写数据；不要向用户暴露联网超时、云函数、API key、搜索工具错误等技术细节。",
    "公开资料查询应由你尽量先完成，不要把“去查官网/去查报告”作为主要回答推给用户。",
    "如果不能确定数据，请明确写出“我这次没有查到可核验资料”或“目前无法核实确切数据”；如果使用的是媒体报道、平台样本或第三方整理，可以给出趋势性参考，但不能包装成官方结论。",
    "当用户请求 JSON 或指定格式时，严格按用户消息里的格式输出，不要附加解释。",
  ].join("\n");
}

async function getResearchContext(event, messages) {
  if (!event || !event.allowWebSearch) {
    return {
      prompt: "",
      meta: {
        enabled: false,
        used: false,
      },
    };
  }

  const rawQuery =
    typeof event.webSearchQuery === "string" && event.webSearchQuery.trim()
      ? event.webSearchQuery.trim()
      : getLastUserContent(messages);

  if (!shouldUseWebSearch(rawQuery)) {
    return {
      prompt: "",
      meta: {
        enabled: true,
        used: false,
        reason: "query_does_not_need_external_fact_check",
      },
    };
  }

  const query = buildOfficialSearchQuery(rawQuery);

  try {
    const resultText = await officialWebSearch(query);

    if (!resultText) {
      return {
        prompt: buildResearchPrompt({
          status: "empty",
          query,
          resultText: "",
        }),
        meta: {
          enabled: true,
          used: true,
          status: "empty",
          query,
        },
      };
    }

    return {
      prompt: buildResearchPrompt({
        status: "ok",
        query,
        resultText,
      }),
      meta: {
        enabled: true,
        used: true,
        status: "ok",
        query,
      },
    };
  } catch (error) {
    return {
      prompt: buildResearchPrompt({
        status: "error",
        query,
        resultText: "",
        error: error && error.message ? error.message : "unknown error",
      }),
      meta: {
        enabled: true,
        used: true,
        status: "error",
        query,
        error: error && error.message ? error.message : "unknown error",
      },
    };
  }
}

function getLastUserContent(messages) {
  const last = messages
    .slice()
    .reverse()
    .find((message) => message && message.role === "user");

  return last && last.content ? last.content : "";
}

function shouldUseWebSearch(query) {
  if (!query || typeof query !== "string") {
    return false;
  }

  return /高考|选科|分科|院校专业组|招生|录取|投档|分数|位次|批次|专业|学校|大学|学院|学费|就业|薪资|收入|行业|城市|政策|考公|读研|出国|人工智能|AI|风险|统计|数据|排名|省份|广东|上海|北京|江苏|浙江|山东|福建|湖北|湖南|河北|辽宁|重庆|四川|河南|安徽|江西|广西|贵州|云南|陕西|山西|黑龙江|吉林|内蒙古|甘肃|青海|宁夏|新疆|海南|天津|西藏/.test(
    query
  );
}

function buildOfficialSearchQuery(query) {
  const normalized = query.replace(/\s+/g, " ").trim();

  if (/高考|选科|分科|院校专业组|招生|录取|投档|分数|位次|批次|志愿|可报/.test(normalized)) {
    return `${normalized} 教育部 阳光高考 招生章程 省教育考试院`;
  }

  if (/薪资|收入|工资|就业|岗位|好就业|城市|深圳|上海|北京|广州|杭州|成都|南京|苏州|武汉/.test(normalized)) {
    return `${normalized} 人社局 统计局 工资指导价位 就业质量报告 招聘平台 薪酬报告 新闻`;
  }

  if (/行业|AI|人工智能|风险|趋势|政策|考公|读研|出国/.test(normalized)) {
    return `${normalized} 统计局 人社部 工信部 官媒 行业报告 研究机构 新闻`;
  }

  if (/大学|学院|学校|专业|学费|培养方案/.test(normalized)) {
    return `${normalized} 本科招生网 培养方案 就业质量报告 官方`;
  }

  return `${normalized} 官方 数据 报告`;
}

function buildResearchPrompt({ status, query, resultText, error }) {
  if (status === "ok") {
    return [
      "【联网检索资料】",
      "下面是云函数联网检索得到的候选资料，优先用于核验学校、专业、选科、招生、就业、城市、政策等现实信息。",
      "重要：这些资料仍需你判断来源层级。官方发布数据优先；权威机构、行业协会、官媒或大型平台报告可以作为重要参考；一般媒体、新闻报道、招聘平台样本或公开讨论也可以使用，但必须注明“非官方/媒体报道/平台样本/第三方整理”，并说明局限。",
      "如果资料足够支持，请直接替用户整理结论和来源；如果只有非官方资料，也可以给趋势性参考，但不能写成确定结论。",
      "如果资料不足以支持具体数字或结论，说明“我这次没有查到足够可核验资料”，不要让用户自己去查。",
      "只有缺少用户个人条件时，才追问用户补充，例如省份、考试年份、选科、分数、城市、目标学校。",
      `检索 query：${query}`,
      "检索结果：",
      resultText,
    ].join("\n");
  }

  if (status === "empty") {
    return [
      "【联网检索资料】",
      `检索 query：${query}`,
      "结果：没有检索到可用资料。",
      "要求：不要编造数据或来源；不要向用户展示搜索工具、联网超时、云函数或 API key 等技术细节。可以说明“我这次没有拿到可核验公开资料”。如果需要继续查询，追问缺失的个人条件或目标对象。不要写“建议你自行查证/自行查询/去官网查”。",
    ].join("\n");
  }

  if (status === "missing_search_key") {
    return [
      "【联网检索资料】",
      `检索 query：${query}`,
      "结果：当前没有取得可用联网资料。",
      "要求：不要向用户提及搜索 API key、云函数、联网工具或技术错误；不要声称已经查到资料；不要编造数据或来源。可以说明“我这次没有拿到可核验公开资料”。如果需要继续查询，追问缺失的个人条件或目标对象。不要写“建议你自行查证/自行查询/去官网查”。",
    ].join("\n");
  }

  return [
    "【联网检索资料】",
    `检索 query：${query}`,
    "结果：当前没有取得可用联网资料。",
    "要求：不要向用户展示联网超时、云函数、API key、搜索工具错误等技术细节；不要声称已经查到资料；不要编造数据或来源。可以说明“我这次没有拿到可核验公开资料”。如果要继续查询，追问更具体的目标对象或个人条件。不要写“建议你自行查证/自行查询/去官网查”。",
  ].join("\n");
}

function officialWebSearch(query) {
  const cached = getCachedSearch(query);

  if (cached) {
    return Promise.resolve(cached);
  }

  const path = `/?q=${encodeURIComponent(query)}`;
  const headers = {
    Accept: "text/plain",
    "User-Agent": "zhiyuan-zhiwai/1.0",
  };
  const searchApiKey = getSearchApiKey();

  if (searchApiKey) {
    headers.Authorization = `Bearer ${searchApiKey}`;
  }

  return requestPlainText(
    {
      hostname: SEARCH_HOST,
      path,
      method: "GET",
      headers,
      timeout: SEARCH_TIMEOUT,
    },
    SEARCH_RESULT_LIMIT
  ).then((result) => {
    setCachedSearch(query, result);
    return result;
  });
}

function getSearchApiKey() {
  return typeof process.env.JINA_API_KEY === "string"
    ? process.env.JINA_API_KEY.trim()
    : "";
}

function getCachedSearch(query) {
  const item = searchCache.get(query);

  if (!item) {
    return "";
  }

  if (Date.now() - item.createdAt > SEARCH_CACHE_TTL) {
    searchCache.delete(query);
    return "";
  }

  return item.result;
}

function setCachedSearch(query, result) {
  if (!result) {
    return;
  }

  if (searchCache.size >= SEARCH_CACHE_LIMIT) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
  }

  searchCache.set(query, {
    result,
    createdAt: Date.now(),
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      return (
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
      );
    })
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function requestDeepSeek(apiKey, payload) {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: DEEPSEEK_HOST,
        path: DEEPSEEK_PATH,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: DEEPSEEK_TIMEOUT,
      },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let data;

          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (error) {
            reject(new Error("DeepSeek returned invalid JSON."));
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const message =
              data.error && data.error.message
                ? data.error.message
                : `DeepSeek API request failed with status ${response.statusCode}.`;
            reject(new Error(message));
            return;
          }

          resolve(data);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("DeepSeek API request timed out."));
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function requestDeepSeekWithFormatFallback(apiKey, payload) {
  try {
    return await requestDeepSeek(apiKey, payload);
  } catch (error) {
    if (!payload || !payload.response_format || !shouldRetryWithoutResponseFormat(error)) {
      throw error;
    }

    const retryPayload = { ...payload };
    delete retryPayload.response_format;
    return requestDeepSeek(apiKey, retryPayload);
  }
}

function shouldRetryWithoutResponseFormat(error) {
  const message = error && error.message ? error.message : "";

  return /response_format|json_object|format/i.test(message);
}

function requestPlainText(options, limit) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let raw = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (raw.length < limit) {
          raw += chunk;
        }
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Web search failed with status ${response.statusCode}.`));
          return;
        }

        resolve(cleanReply(raw).slice(0, limit));
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Web search request timed out."));
    });

    request.on("error", reject);
    request.end();
  });
}

function cleanReply(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim();
}
