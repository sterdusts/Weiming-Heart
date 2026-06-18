const { getExplorationResponse } = require("../../services/explore");
const {
  cleanupEmptyChatSessions,
  createChatSession,
  deleteChatSession,
  getActiveChatSession,
  getChatSessions,
  getExplorationHistory,
  restoreChatSessionsFromCloud,
  saveChatRecords,
  switchChatSession,
} = require("../../services/profile");

Page({
  data: {
    inputValue: "",
    records: [],
    isThinking: false,
    thinkingElapsedSeconds: 0,
    thinkingElapsedText: formatThinkingElapsed(0),
    summary: null,
    answers: [],
    history: [],
    chatSessions: [],
    activeChatId: "",
    activeChatTitle: "新的探索",
    showSessionPanel: false,
    sessionPanelVisible: false,
    scrollIntoView: "",
  },

  onLoad() {
    const answers = wx.getStorageSync("interviewAnswers") || [];
    const summary = wx.getStorageSync("interviewSummary") || null;
    cleanupEmptyChatSessions();
    let activeSession = getActiveChatSession();

    if (!activeSession) {
      activeSession = createChatSession(buildInitialRecords(summary), {
        title: "从探索卡继续",
        summary: "围绕一个现实问题继续拆开看。",
      });
    }

    this.setData({
      answers,
      summary,
      history: getCurrentExplorationHistory(),
      records: normalizeRecordsForDisplay(activeSession.records),
      chatSessions: getChatSessions(),
      activeChatId: activeSession.id,
      activeChatTitle: activeSession.title,
    });

    restoreChatSessionsFromCloud().then((result) => {
      if (!result || !result.activeSession) {
        return;
      }

      const restoredSession = result.activeSession;

      this.setData({
        records: normalizeRecordsForDisplay(restoredSession.records),
        chatSessions: getChatSessions(),
        activeChatId: restoredSession.id,
        activeChatTitle: restoredSession.title,
      });
    });
  },

  onUnload() {
    clearTimeout(this.sessionPanelTimer);
    this.stopThinkingTimer();
    cleanupEmptyChatSessions();
  },

  onHide() {
    cleanupEmptyChatSessions();
  },

  startThinkingTimer() {
    this.stopThinkingTimer();

    const startedAt = Date.now();

    this.thinkingTimer = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);

      if (elapsedSeconds === this.data.thinkingElapsedSeconds) {
        return;
      }

      this.setData({
        thinkingElapsedSeconds: elapsedSeconds,
        thinkingElapsedText: formatThinkingElapsed(elapsedSeconds),
      });
    }, 1000);
  },

  stopThinkingTimer() {
    clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
  },

  onInput(event) {
    this.setData({
      inputValue: event.detail.value,
    });
  },

  openSource(event) {
    const url = event.currentTarget.dataset.url;
    const name = event.currentTarget.dataset.name || "参考来源";

    if (!url) {
      return;
    }

    wx.showModal({
      title: "打开参考来源？",
      content: `即将离开当前阅读位置，打开：${name}`,
      confirmText: "打开",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        wx.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent(name)}`,
          fail: () => {
            copySourceUrl(url);
          },
        });
      },
    });
  },

  openSessionPanel() {
    clearTimeout(this.sessionPanelTimer);
    this.setData({
      chatSessions: getChatSessions(),
      showSessionPanel: true,
      sessionPanelVisible: false,
    });

    this.sessionPanelTimer = setTimeout(() => {
      this.setData({
        sessionPanelVisible: true,
      });
    }, 30);
  },

  closeSessionPanel() {
    if (!this.data.showSessionPanel) {
      return;
    }

    clearTimeout(this.sessionPanelTimer);
    this.setData({
      sessionPanelVisible: false,
    });

    this.sessionPanelTimer = setTimeout(() => {
      this.setData({
        showSessionPanel: false,
      });
    }, 340);
  },

  noop() {},

  createNewChat() {
    cleanupEmptyChatSessions();
    const session = createChatSession(buildInitialRecords(this.data.summary), {
      title: "新的探索",
      summary: "开始一个新的现实问题。",
    });

    this.setData({
      inputValue: "",
      records: normalizeRecordsForDisplay(session.records),
      chatSessions: getChatSessions(),
      activeChatId: session.id,
      activeChatTitle: session.title,
      scrollIntoView: "",
    });

    this.closeSessionPanel();
  },

  switchSession(event) {
    const id = event.currentTarget.dataset.id;
    const session = switchChatSession(id);

    if (!session) {
      return;
    }

    this.setData({
      inputValue: "",
      records: normalizeRecordsForDisplay(session.records),
      chatSessions: getChatSessions(),
      activeChatId: session.id,
      activeChatTitle: session.title,
      scrollIntoView: "",
    });

    this.closeSessionPanel();
  },

  confirmDeleteSession(event) {
    const id = event.currentTarget.dataset.id;
    const session = this.data.chatSessions.find((item) => item.id === id);

    if (!session) {
      return;
    }

    wx.showActionSheet({
      itemList: ["删除这段探索记录"],
      itemColor: "#B42318",
      success: (res) => {
        if (res.tapIndex !== 0) {
          return;
        }

        wx.showModal({
          title: "删除探索记录？",
          content: `删除后无法恢复：${session.title || "这段探索"}`,
          confirmText: "删除",
          confirmColor: "#B42318",
          cancelText: "取消",
          success: (modalRes) => {
            if (!modalRes.confirm) {
              return;
            }

            this.deleteSession(id);
          },
        });
      },
    });
  },

  deleteSession(id) {
    const activeSession = deleteChatSession(id);
    const sessions = getChatSessions();

    this.setData({
      inputValue: "",
      records: activeSession ? normalizeRecordsForDisplay(activeSession.records) : [],
      chatSessions: sessions,
      activeChatId: activeSession ? activeSession.id : "",
      activeChatTitle: activeSession ? activeSession.title : "新的探索",
      scrollIntoView: "",
    });

    wx.showToast({
      title: "已删除",
      icon: "success",
    });
  },

  async submitExplore() {
    if (this.data.isThinking) {
      return;
    }

    const input = this.data.inputValue.trim();

    if (!input) {
      wx.showToast({
        title: "先写下一点想探索的事",
        icon: "none",
      });
      return;
    }

    const userRecord = {
      id: `user-${Date.now()}`,
      type: "user",
      content: input,
    };
    const previousRecords = this.data.records;
    const records = previousRecords.concat(userRecord);

    saveChatRecords(records, {
      title: buildSessionTitle(records),
      summary: "等待这次探索的回应。",
    });

    this.setData({
      inputValue: "",
      records,
      isThinking: true,
      thinkingElapsedSeconds: 0,
      thinkingElapsedText: formatThinkingElapsed(0),
      activeChatTitle: buildSessionTitle(records),
      chatSessions: getChatSessions(),
      scrollIntoView: "thinking",
    });
    this.startThinkingTimer();

    try {
      const aiContent = await getExplorationResponse({
        input,
        records,
        summary: this.data.summary,
        answers: this.data.answers,
        history: this.data.history,
      });
      const aiId = `ai-${Date.now()}`;

      const nextRecords = records.concat({
        id: aiId,
        type: "ai",
        content: aiContent,
      });

      saveChatRecords(nextRecords, {
        title: aiContent.historyTitle || buildSessionTitle(nextRecords),
        summary: aiContent.historySummary || aiContent.question,
      });

      this.setData({
        records: nextRecords,
        history: getCurrentExplorationHistory(),
        chatSessions: getChatSessions(),
        activeChatTitle: (getActiveChatSession() || {}).title || this.data.activeChatTitle,
        scrollIntoView: aiId,
      });
    } catch (error) {
      console.error(error);
      saveChatRecords(previousRecords, {
        title: buildSessionTitle(previousRecords),
        summary: "围绕一个现实问题继续拆开看。",
      });
      this.setData({
        inputValue: input,
        records: previousRecords,
        chatSessions: getChatSessions(),
        activeChatTitle: buildSessionTitle(previousRecords),
        scrollIntoView: "",
      });
      wx.showToast({
        title: "暂时没连上，请再试一次",
        icon: "none",
      });
    } finally {
      this.stopThinkingTimer();
      this.setData({
        isThinking: false,
      });
    }
  },
});

function buildSessionTitle(records) {
  const firstUser = (records || []).find((record) => record && record.type === "user");
  const text = firstUser && firstUser.content ? String(firstUser.content).trim().replace(/\s+/g, "") : "";

  if (!text) {
    return "新的探索";
  }

  return text.length > 14 ? `${text.slice(0, 14)}…` : text;
}

function formatThinkingElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));

  return `思考 ${safeSeconds} 秒`;
}

function getCurrentExplorationHistory() {
  return getExplorationHistory().filter((item) => item && item.isActive).slice(0, 1);
}

function copySourceUrl(url) {
  wx.setClipboardData({
    data: url,
    success: () => {
      wx.showToast({
        title: "链接已复制",
        icon: "success",
      });
    },
    fail: () => {
      wx.showToast({
        title: "暂时无法打开来源",
        icon: "none",
      });
    },
  });
}

function normalizeRecordsForDisplay(records) {
  return removeConsecutiveDuplicateUsers(Array.isArray(records) ? records : []).map((record) => {
    if (!record || record.type !== "ai" || !record.content) {
      return record;
    }

    return {
      ...record,
      content: normalizeAiContentForDisplay(record.content),
    };
  });
}

function removeConsecutiveDuplicateUsers(records) {
  return records.reduce((result, record) => {
    const previous = result[result.length - 1];

    if (
      previous &&
      record &&
      previous.type === "user" &&
      record.type === "user" &&
      String(previous.content || "").trim() === String(record.content || "").trim()
    ) {
      return result;
    }

    result.push(record);
    return result;
  }, []);
}

function normalizeAiContentForDisplay(content) {
  const nextContent = {
    ...content,
    reality: rewriteResearchBurdenText(content.reality),
    realityPerspective: rewriteResearchBurdenText(content.realityPerspective),
    uncertainty: rewriteResearchBurdenText(content.uncertainty),
  };

  if (content.verification) {
    nextContent.verification = {
      ...content.verification,
      basis: rewriteResearchBurdenText(content.verification.basis),
      conflict: rewriteResearchBurdenText(content.verification.conflict),
    };
  }

  if (Array.isArray(content.realityBlocks)) {
    nextContent.realityBlocks = content.realityBlocks.map((block) => {
      if (!block || typeof block !== "object") {
        return block;
      }

      if (block.type === "text" || block.type === "notice") {
        return {
          ...block,
          text: rewriteResearchBurdenText(block.text),
        };
      }

      return block;
    });
  }

  return nextContent;
}

function rewriteResearchBurdenText(text) {
  const content = typeof text === "string" ? text.trim() : "";

  if (!content) {
    return content;
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

function buildInitialRecords(summary) {
  if (!summary || !summary.conclusion) {
    return [];
  }

  return [
    {
      id: "summary-seed",
      type: "ai",
      content: {
        title: "从刚刚的线索继续",
        observation: "我看到你已经留下了一组关于自己和现实的初步线索。",
        reality: "接下来的探索可以更具体地进入专业、城市、收入、风险和学习成本。",
        question: "你现在最想先讨论哪一个现实问题？",
        historyTitle: "自由探索开始",
        historySummary: "从探索卡继续进入具体问题。",
      },
    },
  ];
}
