const { getInterviewSummary } = require("../../services/summary");
const { appendHistory, saveProfileFromSummary } = require("../../services/profile");

const MIN_STAY_TIME = 2600;
const PAGE_FADE_DURATION = 520;

const copy = {
  title: "我正在整理刚刚的回答",
  subtitle: "试着理解你真正关心的东西",
};

Page({
  data: {
    copy,
    answersCount: 0,
    hasError: false,
    pageLeaving: false,
  },

  onLoad() {
    const answers = wx.getStorageSync("interviewAnswers") || [];

    this.setData({
      answersCount: answers.length,
    });

    this.prepareSummary(answers);
  },

  onUnload() {
    clearTimeout(this.redirectTimer);
    clearTimeout(this.leaveTimer);
  },

  async prepareSummary(answers) {
    const startedAt = Date.now();

    this.setData({
      copy,
      hasError: false,
      pageLeaving: false,
    });

    try {
      const result = await getInterviewSummary(answers);
      const restTime = Math.max(0, MIN_STAY_TIME - (Date.now() - startedAt));
      const profile = saveProfileFromSummary(result.summary);
      const savedSummary = {
        ...result.summary,
        card: profile.card,
        conclusion: profile.card.conclusion || result.summary.conclusion || "",
      };

      wx.setStorageSync("interviewSummary", savedSummary);
      appendHistory({
        type: "summary",
        date: profile.updatedAt,
        explorationId: profile.explorationId,
        explorationCount: profile.explorationCount,
        title: profile.card.mainKeyword,
        summary: profile.card.conclusion,
        answers,
        card: profile.card,
        content: JSON.stringify(profile.card),
      });

      this.redirectTimer = setTimeout(() => {
        this.setData({
          copy: {
            title: "整理好了",
            subtitle: "正在生成你的探索卡",
          },
          pageLeaving: true,
        });

        this.leaveTimer = setTimeout(() => {
          wx.redirectTo({
            url: "/pages/summary/index",
          });
        }, PAGE_FADE_DURATION);
      }, restTime);
    } catch (error) {
      console.error(error);
      this.setData({
        copy: {
          title: "整理时遇到一点阻碍",
          subtitle: "请检查云函数和 API Key 后再试一次",
        },
        hasError: true,
      });
    }
  },

  retry() {
    const answers = wx.getStorageSync("interviewAnswers") || [];
    this.prepareSummary(answers);
  },
});
