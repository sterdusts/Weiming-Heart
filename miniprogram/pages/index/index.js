const questions = require("./questions");
const { getReflection } = require("../../services/ai");
const {
  getExplorationHistory,
  getProfile,
  resetCurrentExploration,
  SUMMARY_KEY,
} = require("../../services/profile");

const QUESTION_COPY_OVERRIDES = {
  values: {
    tip: "点选你在意的关键词，可多选。",
    openQuestion: "什么东西，是你不想轻易放掉的？",
    placeholder: "写一点原因，或留给之后慢慢想。",
  },
  concerns: {
    tip: "点选让你担心的关键词，可多选。",
    openQuestion: "这份担心最清楚的时候，是什么样子？",
    placeholder: "或许写一个画面；或许留白也是一种选择。",
  },
  tradeoff: {
    tip: "拖动滑块，选你此刻更偏向哪一边。",
    openQuestion: "为什么你会把自己放在这个位置？",
    placeholder: "可以写一次真实纠结。",
  },
  university: {
    tip: "点选你期待的关键词，可多选。",
    openQuestion: "四年后的我，会希望现在的我记住什么？",
    placeholder: "写给现在的自己，长短都是珍贵话语。",
  },
};

const QUESTION_COPY_REFINEMENTS = {
  values: {
    tip: "可以多选。先不用排序，只要它对你重要就可以点下。",
    openQuestion: "什么东西，是你不想轻易放掉的？",
    placeholder: "写一点原因，或留给之后慢慢想。",
  },
  concerns: {
    tip: "可以多选。担心不是软弱，它通常是在提醒你看见选择成本。",
    openQuestion: "这份担心最清楚的时候，是什么样子？",
    placeholder: "可以写一个画面，也可以先空着。",
  },
  tradeoff: {
    tip: "0 更偏理想，100 更偏现实。",
    openQuestion: "为什么你会把自己放在这个位置？",
    placeholder: "可以写一次真实纠结，也可以不写。",
  },
  university: {
    tip: "可以多选。这里放的是你对大学最朴素的期待。",
    openQuestion: "四年后的我，会希望现在的我记住什么？",
    placeholder: "写给现在的自己，长短都可以。",
  },
};

const CARD_FADE_DURATION = 620;
const FADE_DURATION = 520;
const LANDING_TO_INTERVIEW_DURATION = 420;
const INTERVIEW_ENTER_DELAY = 40;
const RETURN_TO_LANDING_DURATION = 420;
const LANDING_ENTER_DELAY = 40;
const REFLECTION_DURATION = 2400;
const FALLBACK_REFLECTION = "这条线索已经被记录下来。";
const EMPTY_REFLECTION = "这一部分先留白，也是一种真实状态。";

Page({
  data: {
    mode: "landing",
    profile: null,
    history: [],
    homeTitle: "志愿之外",
    homeSubtitle: "现实为底，理想为灯",
    hasProfile: false,
    questions,
    currentIndex: 0,
    currentQuestion: getQuestionAt(0),
    fieldValues: buildFieldValues(getQuestionAt(0)),
    optionItems: buildOptionItems(getQuestionAt(0)),
    sliderValue: getSliderDefault(getQuestionAt(0)),
    sliderText: describeSlider(getSliderDefault(getQuestionAt(0))),
    openValue: "",
    answers: [],
    progressText: questions.length ? `1 / ${questions.length}` : "0 / 0",
    progressPercent: questions.length ? Math.round((1 / questions.length) * 100) : 0,
    isReflecting: false,
    isAdvancing: false,
    reflectionText: "",
    reflectionVisible: false,
    cardVisible: true,
    isStartingInterview: false,
    isReturningLanding: false,
    landingEntering: true,
    interviewEntering: false,
    pageLeaving: false,
  },

  onLoad() {
    this.loadLandingState();
  },

  onShow() {
    if (this.data.mode === "landing") {
      this.loadLandingState();
    }
  },

  onUnload() {
    this.clearTimers();
  },

  loadLandingState(options) {
    const profile = getProfile();
    const params = options || {};
    const shouldAnimateEntry = !!params.animateEntry;

    clearTimeout(this.landingEnterTimer);

    this.setData({
      mode: "landing",
      profile,
      history: getExplorationHistory(),
      hasProfile: !!(profile && profile.card),
      homeTitle: profile && profile.card ? profile.card.mainKeyword : "志愿之外",
      homeSubtitle: "现实为底，理想为灯",
      isReflecting: false,
      isAdvancing: false,
      reflectionVisible: false,
      cardVisible: true,
      isStartingInterview: false,
      isReturningLanding: false,
      landingEntering: !shouldAnimateEntry,
      interviewEntering: false,
      pageLeaving: false,
    });

    if (shouldAnimateEntry) {
      this.landingEnterTimer = setTimeout(() => {
        this.setData({
          landingEntering: true,
        });
      }, LANDING_ENTER_DELAY);
    }
  },

  startExploration() {
    if (this.data.isStartingInterview || this.data.pageLeaving || this.data.mode !== "landing") {
      return;
    }

    this.clearTimers();
    this.setData({
      isStartingInterview: true,
      landingEntering: false,
    });

    this.startInterviewTimer = setTimeout(() => {
      this.beginInterview(true);
    }, LANDING_TO_INTERVIEW_DURATION);
  },

  returnLanding() {
    if (this.data.isReturningLanding || this.data.pageLeaving || this.data.mode === "landing") {
      return;
    }

    this.clearTimers();
    this.setData({
      isReturningLanding: true,
      interviewEntering: false,
    });

    this.returnLandingTimer = setTimeout(() => {
      this.loadLandingState({
        animateEntry: true,
      });
    }, RETURN_TO_LANDING_DURATION);
  },

  beginInterview(animateEntry) {
    this.resetInterviewState({
      animateEntry,
    });
  },

  continueExplore() {
    this.navigateWithLandingFade("/pages/explore/index");
  },

  viewCard() {
    const profile = getProfile();

    if (!profile || !profile.card) {
      wx.showToast({
        title: "完成问卷后会生成探索卡",
        icon: "none",
      });
      return;
    }

    if (profile && profile.card) {
      wx.setStorageSync(SUMMARY_KEY, {
        card: profile.card,
        conclusion: profile.card.conclusion,
      });
    }

    this.navigateWithLandingFade("/pages/summary/index");
  },

  viewHistory() {
    this.navigateWithLandingFade("/pages/history/index");
  },

  noop() {},

  restartExploration() {
    resetCurrentExploration();
    this.resetInterviewState();
  },

  resetInterviewState(options) {
    const firstQuestion = getQuestionAt(0);
    const shouldAnimateEntry = !!(options && options.animateEntry);

    this.clearTimers();
    this.setData({
      mode: "interview",
      profile: getProfile(),
      currentIndex: 0,
      currentQuestion: firstQuestion,
      ...buildQuestionState(firstQuestion),
      answers: [],
      progressText: questions.length ? `1 / ${questions.length}` : "0 / 0",
      progressPercent: questions.length ? Math.round((1 / questions.length) * 100) : 0,
      isReflecting: false,
      isAdvancing: false,
      reflectionText: "",
      reflectionVisible: false,
      cardVisible: !shouldAnimateEntry,
      isStartingInterview: false,
      isReturningLanding: false,
      landingEntering: false,
      interviewEntering: !shouldAnimateEntry,
      pageLeaving: false,
    });

    if (shouldAnimateEntry) {
      this.interviewEnterTimer = setTimeout(() => {
        this.setData({
          cardVisible: true,
          interviewEntering: true,
        });
      }, INTERVIEW_ENTER_DELAY);
    }
  },

  onFieldInput(event) {
    const index = Number(event.currentTarget.dataset.index);

    if (Number.isNaN(index)) {
      return;
    }

    this.setData({
      [`fieldValues[${index}].value`]: event.detail.value,
    });
  },

  toggleOption(event) {
    const index = Number(event.currentTarget.dataset.index);
    const option = this.data.optionItems[index];

    if (!option) {
      return;
    }

    this.setData({
      [`optionItems[${index}].selected`]: !option.selected,
    });
  },

  onSliderChange(event) {
    const value = clamp(Math.round(Number(event.detail.value)), 0, 100);

    this.setData({
      sliderValue: value,
      sliderText: describeSlider(value),
    });
  },

  onOpenInput(event) {
    this.setData({
      openValue: event.detail.value,
    });
  },

  async nextQuestion() {
    if (this.data.isReflecting || this.data.isAdvancing || this.data.pageLeaving) {
      return;
    }

    const currentQuestion = this.data.currentQuestion;
    const payload = buildAnswerPayload(currentQuestion, this.data);
    const nextAnswer = payload.answer
      ? {
          id: currentQuestion.id,
          title: currentQuestion.title,
          answer: payload.answer,
          details: payload.details,
        }
      : null;
    const answers = nextAnswer ? this.data.answers.concat(nextAnswer) : this.data.answers;
    const nextIndex = this.data.currentIndex + 1;

    if (this.data.currentIndex === 0) {
      wx.removeStorageSync(SUMMARY_KEY);
    }

    wx.setStorageSync("interviewAnswers", answers);

    this.setData({
      answers,
      cardVisible: false,
      isAdvancing: true,
    });

    await this.waitForCardFade();

    this.setData({
      isAdvancing: false,
      isReflecting: true,
      reflectionText: "正在整理你的回答...",
      reflectionVisible: false,
    });

    this.reflectionInTimer = setTimeout(() => {
      this.setData({
        reflectionVisible: true,
      });
    }, 40);

    if (!payload.answer) {
      this.showReflection(EMPTY_REFLECTION, nextIndex);
      return;
    }

    try {
      const result = await getReflection({
        question: currentQuestion,
        answer: payload.answer,
        answers,
      });

      this.showReflection(result.reflection, nextIndex);
    } catch (error) {
      console.error(error);
      this.showReflection(FALLBACK_REFLECTION, nextIndex);
    }
  },

  showReflection(reflection, nextIndex) {
    clearTimeout(this.fadeOutTimer);
    clearTimeout(this.fadeInTimer);
    clearTimeout(this.reflectionTimer);
    clearTimeout(this.reflectionInTimer);

    this.setData({
      reflectionVisible: false,
    });

    this.fadeOutTimer = setTimeout(() => {
      this.setData({
        reflectionText: reflection || FALLBACK_REFLECTION,
      });

      this.fadeInTimer = setTimeout(() => {
        this.setData({
          reflectionVisible: true,
        });
      }, 30);
    }, FADE_DURATION);

    this.reflectionTimer = setTimeout(() => {
      this.hideReflection(nextIndex);
    }, REFLECTION_DURATION + FADE_DURATION);
  },

  hideReflection(nextIndex) {
    this.setData({
      reflectionVisible: false,
    });

    this.advanceTimer = setTimeout(() => {
      this.advanceTo(nextIndex);
    }, FADE_DURATION);
  },

  advanceTo(nextIndex) {
    if (nextIndex >= this.data.questions.length) {
      this.enterTransition();
      return;
    }

    const nextQuestion = getQuestionAt(nextIndex);

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQuestion,
      ...buildQuestionState(nextQuestion),
      isReflecting: false,
      isAdvancing: false,
      reflectionText: "",
      cardVisible: false,
      progressText: `${nextIndex + 1} / ${this.data.questions.length}`,
      progressPercent: Math.round(((nextIndex + 1) / this.data.questions.length) * 100),
    });

    this.cardInTimer = setTimeout(() => {
      this.setData({
        cardVisible: true,
      });
    }, 40);
  },

  enterTransition() {
    this.setData({
      pageLeaving: true,
      isReflecting: false,
      reflectionText: "",
      progressText: `${this.data.questions.length} / ${this.data.questions.length}`,
      progressPercent: 100,
    });

    this.redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: "/pages/transition/index",
      });
    }, 320);
  },

  waitForCardFade() {
    clearTimeout(this.toReflectionTimer);

    return new Promise((resolve) => {
      this.toReflectionTimer = setTimeout(resolve, CARD_FADE_DURATION);
    });
  },

  clearTimers() {
    clearTimeout(this.toReflectionTimer);
    clearTimeout(this.fadeOutTimer);
    clearTimeout(this.fadeInTimer);
    clearTimeout(this.reflectionInTimer);
    clearTimeout(this.reflectionTimer);
    clearTimeout(this.advanceTimer);
    clearTimeout(this.cardInTimer);
    clearTimeout(this.redirectTimer);
    clearTimeout(this.navigateTimer);
    clearTimeout(this.startInterviewTimer);
    clearTimeout(this.interviewEnterTimer);
    clearTimeout(this.returnLandingTimer);
    clearTimeout(this.landingEnterTimer);
  },

  navigateWithLandingFade(url) {
    if (this.data.pageLeaving) {
      return;
    }

    this.setData({
      pageLeaving: true,
    });

    this.navigateTimer = setTimeout(() => {
      wx.navigateTo({
        url,
      });
    }, 340);
  },
});

function getQuestionAt(index) {
  const question = questions[index] || null;

  if (!question) {
    return null;
  }

  const copyOverride = QUESTION_COPY_REFINEMENTS[question.id] || QUESTION_COPY_OVERRIDES[question.id];

  if (!copyOverride) {
    return question;
  }

  return {
    ...question,
    ...copyOverride,
  };
}

function buildQuestionState(question) {
  return {
    fieldValues: buildFieldValues(question),
    optionItems: buildOptionItems(question),
    sliderValue: getSliderDefault(question),
    sliderText: describeSlider(getSliderDefault(question)),
    openValue: "",
  };
}

function buildFieldValues(question) {
  if (!question || question.type !== "fields") {
    return [];
  }

  return question.fields.map((field) => ({
    ...field,
    inputType: field.inputType || "text",
    value: "",
  }));
}

function buildOptionItems(question) {
  if (!question || !Array.isArray(question.options)) {
    return [];
  }

  return question.options.map((label) => ({
    label,
    selected: false,
  }));
}

function getSliderDefault(question) {
  if (!question || question.type !== "slider") {
    return 50;
  }

  return typeof question.defaultValue === "number" ? question.defaultValue : 50;
}

function buildAnswerPayload(question, state) {
  if (!question) {
    return { answer: "", details: {} };
  }

  if (question.type === "fields") {
    const details = {};
    const parts = state.fieldValues
      .map((field) => {
        const value = normalizeInput(field.value);

        if (!value) {
          return "";
        }

        details[field.key] = value;
        return `${field.summaryLabel || field.label}：${value}`;
      })
      .filter(Boolean);

    return {
      answer: parts.join("；"),
      details,
    };
  }

  if (question.type === "multi") {
    const selected = getSelectedOptions(state.optionItems);
    const note = normalizeInput(state.openValue);
    const parts = [];

    if (selected.length) {
      parts.push(selected.join("、"));
    }

    if (note) {
      parts.push(`补充：${note}`);
    }

    return {
      answer: parts.join("；"),
      details: {
        selected,
        note,
      },
    };
  }

  if (question.type === "slider") {
    const value = clamp(Math.round(Number(state.sliderValue)), 0, 100);
    const label = describeSlider(value);
    const note = normalizeInput(state.openValue);
    const answer = note
      ? `理想与现实取向：${value}/100（${label}）；补充：${note}`
      : `理想与现实取向：${value}/100（${label}）`;

    return {
      answer,
      details: {
        value,
        label,
        note,
      },
    };
  }

  if (question.type === "mixed") {
    const selected = getSelectedOptions(state.optionItems);
    const note = normalizeInput(state.openValue);
    const parts = [];

    if (selected.length) {
      parts.push(`希望大学带给我：${selected.join("、")}`);
    }

    if (note) {
      parts.push(`四年后的提醒：${note}`);
    }

    return {
      answer: parts.join("；"),
      details: {
        selected,
        note,
      },
    };
  }

  return { answer: "", details: {} };
}

function getSelectedOptions(optionItems) {
  return (optionItems || [])
    .filter((item) => item.selected)
    .map((item) => item.label);
}

function describeSlider(value) {
  if (value <= 20) {
    return "更愿意让理想牵引选择";
  }

  if (value <= 40) {
    return "略偏理想，但会看现实边界";
  }

  if (value < 60) {
    return "在理想和现实之间保持平衡";
  }

  if (value < 80) {
    return "更重视现实可行性";
  }

  return "明显偏向现实优先";
}

function normalizeInput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}
