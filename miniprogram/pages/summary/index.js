const { getInterviewSummary } = require("../../services/summary");
const {
  appendHistory,
  getProfile,
  resetCurrentExploration,
  saveProfileFromSummary,
} = require("../../services/profile");

const CANVAS_WIDTH = 1080;
const MIN_CANVAS_HEIGHT = 1350;
const MINI_CODE_SRC = "/assets/mini-code.jpg";
const PLACEHOLDER_PATTERN = /^(暂未填写|未知|未确定|不确定|不知道|暂未考虑|没想好|还没想好|无|没有|暂无|空|none|null|undefined)$/i;

const pageCopy = {
  shareButton: "分享探索卡",
  saveButton: "保存到相册",
  exploreButton: "继续自由探索",
  restartButton: "重新开始探索",
  savingText: "正在生成图片",
  savedText: "已保存到相册",
  saveFailedText: "保存失败",
  shareTitle: "我生成了自己的志愿之外探索卡",
};

const defaultCard = {
  brand: "志愿之外",
  subtitle: "现实为底，理想为灯",
  mainKeyword: "现实理想家",
  subKeywords: "现实考量 · 理想驱动 · 成长探索",
  radar: [
    { name: "创造", value: 70 },
    { name: "成长", value: 84 },
    { name: "自由", value: 72 },
    { name: "稳定", value: 64 },
    { name: "理想", value: 78 },
    { name: "现实", value: 76 },
  ],
  intentionRows: [],
  targetSchool: "",
  targetMajor: "",
  majorMatchConfidence: 0,
  conclusion: "你似乎希望在现实的基础上，为理想留出空间；这不意味着放弃现实，而是在寻找二者共存的方式。",
  explorationDate: "",
  explorationCount: 1,
};

Page({
  data: {
    pageCopy,
    summaryCard: defaultCard,
    isReady: false,
    pageVisible: false,
    pageLeaving: false,
    cardImagePath: "",
    imageReady: false,
    shareCanvasHeight: MIN_CANVAS_HEIGHT,
  },

  async onLoad() {
    const cachedSummary = wx.getStorageSync("interviewSummary");
    const answers = wx.getStorageSync("interviewAnswers") || [];

    if (isValidSummary(cachedSummary) && !needsMajorRefresh(cachedSummary, answers)) {
      this.showSummary(cachedSummary);
      return;
    }

    await this.generateSummary();
  },

  onShow() {
    if (!this.data.pageLeaving) {
      return;
    }

    clearTimeout(this.navigateTimer);
    this.setData(
      {
        pageLeaving: false,
        pageVisible: true,
      },
      () => {
        if (this.data.isReady) {
          this.drawRadarCanvas();
        }
      }
    );
  },

  onShareAppMessage() {
    return {
      title: pageCopy.shareTitle,
      path: "/pages/index/index",
      imageUrl: this.data.cardImagePath,
    };
  },

  async generateSummary() {
    try {
      const answers = wx.getStorageSync("interviewAnswers") || [];
      const result = await getInterviewSummary(answers);
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
      this.showSummary(savedSummary);
    } catch (error) {
      console.error(error);
      wx.showToast({
        title: "总结生成失败",
        icon: "none",
      });
    }
  },

  showSummary(summary) {
    const summaryCard = buildSummaryCard(summary);

    this.setData(
      {
        summaryCard,
        isReady: true,
        pageVisible: false,
        pageLeaving: false,
        cardImagePath: "",
        imageReady: false,
        shareCanvasHeight: measureShareCardHeight(summaryCard),
      },
      () => {
        this.drawRadarCanvas();
        this.generateCardImage();
        clearTimeout(this.enterTimer);
        this.enterTimer = setTimeout(() => {
          this.setData({
            pageVisible: true,
          });
        }, 60);
      }
    );
  },

  onUnload() {
    clearTimeout(this.enterTimer);
    clearTimeout(this.navigateTimer);
  },

  async saveCard() {
    try {
      wx.showLoading({
        title: pageCopy.savingText,
        mask: true,
      });

      const imagePath = this.data.cardImagePath || (await this.generateCardImage());

      await saveImage(imagePath);
      wx.hideLoading();
      wx.showToast({
        title: pageCopy.savedText,
        icon: "success",
      });
    } catch (error) {
      wx.hideLoading();
      console.error(error);
      wx.showToast({
        title: pageCopy.saveFailedText,
        icon: "none",
      });
    }
  },

  enterExplore() {
    if (this.data.pageLeaving) {
      return;
    }

    this.setData({
      pageLeaving: true,
    });

    this.navigateTimer = setTimeout(() => {
      wx.navigateTo({
        url: "/pages/explore/index",
        fail: () => {
          this.setData({
            pageLeaving: false,
            pageVisible: true,
          });
        },
      });
    }, 340);
  },

  restartExploration() {
    resetCurrentExploration();
    wx.redirectTo({
      url: "/pages/index/index",
    });
  },

  drawRadarCanvas() {
    this.drawCanvasById("radarCanvas", 260, 235, (ctx) => {
      drawRadar(ctx, this.data.summaryCard.radar, 130, 116, 72, {
        centerText: this.data.summaryCard.mainKeyword,
        labelSize: 12,
        centerSize: 13,
        valueFill: "rgba(61, 189, 147, 0.2)",
      });
    });
  },

  generateCardImage() {
    return new Promise((resolve, reject) => {
      const canvasHeight = measureShareCardHeight(this.data.summaryCard);

      this.setData({
        shareCanvasHeight: canvasHeight,
      });

      this.drawCanvasById(
        "shareCanvas",
        CANVAS_WIDTH,
        canvasHeight,
        (ctx, canvas) => {
          return drawShareCard(ctx, this.data.summaryCard, canvasHeight, canvas);
        },
        (canvas) => {
          wx.canvasToTempFilePath(
            {
              canvas,
              x: 0,
              y: 0,
              width: CANVAS_WIDTH,
              height: canvasHeight,
              destWidth: CANVAS_WIDTH,
              destHeight: canvasHeight,
              success: (res) => {
                this.setData({
                  cardImagePath: res.tempFilePath,
                  imageReady: true,
                });
                resolve(res.tempFilePath);
              },
              fail: reject,
            },
            this
          );
        },
        reject
      );
    });
  },

  drawCanvasById(id, width, height, draw, done, fail) {
    wx.createSelectorQuery()
      .in(this)
      .select(`#${id}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;

        if (!canvas) {
          if (fail) {
            fail(new Error(`Canvas ${id} not found.`));
          }
          return;
        }

        const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;

        const ctx = canvas.getContext("2d");
        ctx.scale(pixelRatio, pixelRatio);
        ctx.clearRect(0, 0, width, height);

        Promise.resolve(draw(ctx, canvas))
          .then(() => {
            if (done) {
              setTimeout(() => done(canvas), 80);
            }
          })
          .catch((error) => {
            if (fail) {
              fail(error);
            }
          });
      });
  },
});

function buildSummaryCard(summary) {
  const card = summary && summary.card ? summary.card : summary || {};
  const profile = getProfile() || {};
  const answers = wx.getStorageSync("interviewAnswers") || [];

  return {
    brand: "志愿之外",
    subtitle: card.subtitle || defaultCard.subtitle,
    mainKeyword: card.mainKeyword || defaultCard.mainKeyword,
    subKeywords: card.subKeywords || buildSubKeywords(card.tags) || defaultCard.subKeywords,
    targetSchool: normalizeDisplayText(card.targetSchool),
    targetMajor: normalizeDisplayText(card.targetMajor),
    majorMatchConfidence: clamp(Math.round(Number(card.majorMatchConfidence) || 0), 0, 100),
    intentionRows: extractIntentionRows(card, answers),
    radar: normalizeRadar(card.radar),
    conclusion: card.conclusion || defaultCard.conclusion,
    explorationId: card.explorationId || profile.explorationId || "",
    explorationDate: card.explorationDate || profile.updatedAt || defaultCard.explorationDate,
    explorationCount: card.explorationCount || profile.explorationCount || defaultCard.explorationCount,
  };
}

function extractIntentionRows(card, answers) {
  if (!Array.isArray(answers)) {
    return [];
  }

  const futureAnswer = answers.find((item) => item && item.id === "future");
  const details = futureAnswer && futureAnswer.details ? futureAnswer.details : {};
  const inputSchool = normalizeDisplayText(details.targetSchool);
  const inputMajor = normalizeDisplayText(details.targetMajor);
  const normalizedSchool = normalizeDisplayText(card.targetSchool);
  const normalizedMajor = normalizeDisplayText(card.targetMajor);
  const majorMatchConfidence = clamp(Math.round(Number(card.majorMatchConfidence) || 0), 0, 100);
  const school = normalizedSchool || inputSchool;
  const shouldShowMajor = inputMajor && (!school || (normalizedMajor && majorMatchConfidence >= 80));
  const major = shouldShowMajor ? normalizedMajor || inputMajor : "";
  const rows = [];

  if (school) {
    rows.push({
      label: "想去的学校",
      value: school,
    });
  }

  if (major) {
    rows.push({
      label: "想学的专业",
      value: major,
    });
  }

  return rows;
}

function buildSubKeywords(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return "";
  }

  return tags.slice(0, 3).join(" · ");
}

function normalizeDisplayText(text) {
  const value = typeof text === "string" || typeof text === "number" ? String(text).trim() : "";

  if (!value || PLACEHOLDER_PATTERN.test(value)) {
    return "";
  }

  return value;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function normalizeRadar(radar) {
  if (!Array.isArray(radar) || !radar.length) {
    return defaultCard.radar;
  }

  const dimensions = ["创造", "成长", "自由", "稳定", "理想", "现实"];

  return dimensions.map((name) => {
    const item = radar.find((radarItem) => radarItem && radarItem.name === name);
    const fallback = defaultCard.radar.find((radarItem) => radarItem.name === name);

    return {
      name,
      value: item ? Number(item.value) || fallback.value : fallback.value,
    };
  });
}

function isValidSummary(summary) {
  return summary && (summary.card || summary.conclusion);
}

function needsMajorRefresh(summary, answers) {
  const card = summary && summary.card ? summary.card : summary || {};
  const rows = extractIntentionRowsFromAnswers(answers);
  const hasInputMajor = Boolean(rows.inputMajor);
  const hasMatchFields = Object.prototype.hasOwnProperty.call(card, "majorMatchConfidence")
    || Object.prototype.hasOwnProperty.call(card, "targetMajor");

  return hasInputMajor && !hasMatchFields;
}

function extractIntentionRowsFromAnswers(answers) {
  if (!Array.isArray(answers)) {
    return {
      inputSchool: "",
      inputMajor: "",
    };
  }

  const futureAnswer = answers.find((item) => item && item.id === "future");
  const details = futureAnswer && futureAnswer.details ? futureAnswer.details : {};

  return {
    inputSchool: normalizeDisplayText(details.targetSchool),
    inputMajor: normalizeDisplayText(details.targetMajor),
  };
}

function saveImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject,
    });
  });
}

function measureShareCardHeight(card) {
  const subKeywordLines = estimateLineCount(card.subKeywords, 24);
  const subKeywordsBottom = 444 + subKeywordLines * 40;
  const intentionStartY = Math.max(500, subKeywordsBottom + 24);
  const radarTitleY = measureIntentionsBottom(card.intentionRows, intentionStartY);
  const conclusionY = radarTitleY + 530;
  const conclusionLines = estimateLineCount(card.conclusion, 22);
  const contentBottom = conclusionY + conclusionLines * 48;

  return Math.max(MIN_CANVAS_HEIGHT, contentBottom + 310);
}

function measureIntentionsBottom(rows, y) {
  if (!Array.isArray(rows) || !rows.length) {
    return y + 20;
  }

  return rows.slice(0, 2).reduce((currentY, row) => {
    const valueLines = estimateLineCount(row.value, 20);
    const rowBottom = currentY + Math.max(38, valueLines * 38);

    return rowBottom + 8;
  }, y) + 26;
}

function estimateLineCount(text, charsPerLine) {
  const content = typeof text === "string" || typeof text === "number" ? String(text).trim() : "";

  if (!content) {
    return 1;
  }

  return Math.max(1, Math.ceil(content.length / charsPerLine));
}

async function drawShareCard(ctx, card, canvasHeight, canvas) {
  const cardHeight = canvasHeight - 184;

  drawRoundRect(ctx, 0, 0, CANVAS_WIDTH, canvasHeight, 0, "#F8F7F4");
  drawShareCardShadow(ctx, cardHeight);
  drawRoundRect(ctx, 86, 92, 908, cardHeight, 52, "#FFFDF8");
  drawPageLeafDecoration(ctx, 896, 196, 136, 0.1, -18);
  drawPageLeafDecoration(ctx, 180, canvasHeight - 206, 158, 0.1, 16);

  ctx.fillStyle = "#1F2937";
  ctx.font = "600 42px sans-serif";
  ctx.fillText(card.brand, 152, 200);
  ctx.fillStyle = "rgba(31, 41, 55, 0.54)";
  ctx.font = "32px sans-serif";
  ctx.fillText(card.subtitle, 152, 252);
  drawMetaText(ctx, card, 928, 204);

  drawFittedText(ctx, card.mainKeyword, 152, 386, 760, {
    color: "#1F2937",
    maxSize: 80,
    minSize: 62,
    weight: 700,
  });

  const subKeywordsBottom = drawWrappedText(ctx, card.subKeywords, 152, 444, 760, 40, {
    color: "#6B7280",
    font: "30px sans-serif",
  });

  const intentionStartY = Math.max(500, subKeywordsBottom + 24);
  const radarTitleY = drawShareIntentions(ctx, card.intentionRows, 152, intentionStartY);

  ctx.fillStyle = "rgba(31, 41, 55, 0.56)";
  ctx.font = "30px sans-serif";
  const radarTitle = "当前内心关注度";
  ctx.fillText(radarTitle, 540 - ctx.measureText(radarTitle).width / 2, radarTitleY);

  drawRadar(ctx, card.radar, 540, radarTitleY + 238, 150, {
    centerText: card.mainKeyword,
    labelSize: 28,
    centerSize: 25,
    valueFill: "rgba(61, 189, 147, 0.2)",
  });

  drawWrappedText(ctx, card.conclusion, 152, radarTitleY + 530, 776, 48, {
    color: "#1F2937",
    font: "34px sans-serif",
  });

  await drawMiniCodeFooter(ctx, canvas, canvasHeight - 254);
}

async function drawMiniCodeFooter(ctx, canvas, y) {
  const codeSize = 126;
  const shellSize = 146;
  const shellX = 152;
  const shellY = y;
  const textX = shellX + shellSize + 30;
  const textY = shellY + 48;

  ctx.save();
  drawRoundRect(ctx, shellX, shellY, 776, shellSize, 26, "rgba(61, 189, 147, 0.06)");
  drawRoundRect(ctx, shellX + 12, shellY + 10, codeSize, codeSize, 20, "#FFFFFF");

  try {
    const image = await loadCanvasImage(canvas, MINI_CODE_SRC);
    ctx.drawImage(image, shellX + 12, shellY + 10, codeSize, codeSize);
  } catch (error) {
    drawLeafShape(ctx, shellX + 74, shellY + 74, 34, "rgba(61, 189, 147, 0.28)");
  }

  ctx.fillStyle = "#1F2937";
  ctx.font = "600 30px sans-serif";
  ctx.fillText("扫码继续探索", textX, textY);
  ctx.fillStyle = "rgba(31, 41, 55, 0.48)";
  ctx.font = "25px sans-serif";
  ctx.fillText("生成你的志愿之外探索卡", textX, textY + 42);
  ctx.fillStyle = "rgba(35, 119, 93, 0.58)";
  ctx.font = "22px sans-serif";
  ctx.fillText("现实为底，理想为灯", textX, textY + 78);
  ctx.restore();
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    if (!canvas || !canvas.createImage) {
      reject(new Error("Canvas image API unavailable."));
      return;
    }

    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawShareIntentions(ctx, rows, x, y) {
  if (!Array.isArray(rows) || !rows.length) {
    return y + 20;
  }

  let currentY = y;

  rows.slice(0, 2).forEach((row) => {
    ctx.save();
    ctx.fillStyle = "rgba(31, 41, 55, 0.46)";
    ctx.font = "26px sans-serif";
    ctx.fillText(row.label, x, currentY);
    const valueBottom = drawWrappedText(ctx, row.value, x + 154, currentY, 606, 38, {
      color: "#1F2937",
      font: "28px sans-serif",
    });
    ctx.restore();
    currentY = Math.max(currentY + 38, valueBottom) + 8;
  });

  return currentY + 26;
}

function drawShareCardShadow(ctx, cardHeight) {
  ctx.save();
  ctx.shadowColor = "rgba(31, 41, 55, 0.08)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 28;
  drawRoundRect(ctx, 86, 92, 908, cardHeight, 52, "#FFFDF8");
  ctx.restore();
}

function drawMetaText(ctx, card, rightX, y) {
  const countText = `第 ${card.explorationCount || 1} 次探索`;
  const dateText = card.explorationDate || "";

  ctx.save();
  ctx.fillStyle = "rgba(31, 41, 55, 0.42)";
  ctx.font = "26px sans-serif";
  ctx.fillText(countText, rightX - ctx.measureText(countText).width, y);

  if (dateText) {
    ctx.fillText(dateText, rightX - ctx.measureText(dateText).width, y + 40);
  }

  ctx.restore();
}


function drawFittedText(ctx, text, x, y, maxWidth, options) {
  const content = text || "";
  let size = options.maxSize;

  ctx.save();
  ctx.fillStyle = options.color;

  while (size > options.minSize) {
    ctx.font = `${options.weight || 400} ${size}px sans-serif`;

    if (ctx.measureText(content).width <= maxWidth) {
      break;
    }

    size -= 2;
  }

  ctx.fillText(content, x, y);
  ctx.restore();
}

function drawSingleLineText(ctx, text, x, y, maxWidth, options) {
  let content = text || "";

  ctx.save();
  ctx.fillStyle = options.color;
  ctx.font = options.font;

  while (content.length > 1 && ctx.measureText(content).width > maxWidth) {
    content = content.slice(0, -2);
  }

  if (content !== text) {
    content = `${content}…`;
  }

  ctx.fillText(content, x, y);
  ctx.restore();
}

function drawRadar(ctx, radar, centerX, centerY, radius, options) {
  const count = radar.length;
  const angles = radar.map((_, index) => -Math.PI / 2 + (index * Math.PI * 2) / count);

  ctx.save();
  ctx.strokeStyle = "rgba(31, 41, 55, 0.08)";
  ctx.lineWidth = 1;

  [0.33, 0.66, 1].forEach((scale) => {
    drawPolygon(ctx, angles, centerX, centerY, radius * scale);
    ctx.stroke();
  });

  angles.forEach((angle) => {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  });

  ctx.beginPath();
  radar.forEach((item, index) => {
    const valueRadius = radius * (item.value / 100);
    const x = centerX + Math.cos(angles[index]) * valueRadius;
    const y = centerY + Math.sin(angles[index]) * valueRadius;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = options.valueFill;
  ctx.fill();
  ctx.strokeStyle = "#3DBD93";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(31, 41, 55, 0.62)";
  ctx.font = `${options.labelSize}px sans-serif`;
  radar.forEach((item, index) => {
    const labelRadius = radius + options.labelSize * 1.7;
    const x = centerX + Math.cos(angles[index]) * labelRadius;
    const y = centerY + Math.sin(angles[index]) * labelRadius;
    const textWidth = ctx.measureText(item.name).width;
    ctx.fillText(item.name, x - textWidth / 2, y + options.labelSize / 3);
  });

  if (options.centerText) {
    ctx.fillStyle = "#23775D";
    ctx.font = `600 ${options.centerSize}px sans-serif`;
    const width = ctx.measureText(options.centerText).width;
    ctx.fillText(options.centerText, centerX - width / 2, centerY + options.centerSize / 3);
  }

  ctx.restore();
}

function drawPolygon(ctx, angles, centerX, centerY, radius) {
  ctx.beginPath();
  angles.forEach((angle, index) => {
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
}

function drawLeafShape(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.55);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.bezierCurveTo(size * 0.72, size * 0.42, size * 0.72, -size * 0.42, 0, -size);
  ctx.bezierCurveTo(-size * 0.72, -size * 0.42, -size * 0.72, size * 0.42, 0, size);
  ctx.fill();
  ctx.restore();
}

function drawPageLeafDecoration(ctx, x, y, size, opacity, rotateDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(((rotateDeg || 0) * Math.PI) / 180);
  ctx.scale(size / 96, size / 96);
  ctx.translate(-48, -48);
  ctx.globalAlpha = opacity;

  ctx.fillStyle = "#3DBD93";
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.bezierCurveTo(42.2, 64.8, 43.8, 48.9, 52.8, 35.6);
  ctx.bezierCurveTo(60.2, 24.7, 72, 17.8, 86, 14);
  ctx.bezierCurveTo(85.4, 29.9, 80.9, 43.2, 72.6, 53.8);
  ctx.bezierCurveTo(64.5, 64, 56.1, 70.7, 48, 80);
  ctx.fill();

  ctx.fillStyle = "#6FD3B0";
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.bezierCurveTo(39.5, 70.2, 31.8, 62.6, 25.3, 52.6);
  ctx.bezierCurveTo(18.6, 42.1, 15.1, 29.8, 14, 16);
  ctx.bezierCurveTo(28.1, 19.7, 39.8, 26.3, 47, 36.6);
  ctx.bezierCurveTo(55.4, 48.8, 56.4, 64.5, 48, 80);
  ctx.fill();

  ctx.strokeStyle = "#F8F7F4";
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.bezierCurveTo(48.9, 62.2, 51.8, 47.1, 58.9, 33.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.bezierCurveTo(45.9, 64.3, 41.2, 50.2, 32.9, 37.7);
  ctx.stroke();

  ctx.strokeStyle = "#3DBD93";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(48, 80);
  ctx.lineTo(48, 88);
  ctx.stroke();
  ctx.restore();
}

function drawRoundRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, options) {
  ctx.fillStyle = options.color;
  ctx.font = options.font;

  let line = "";
  let currentY = y;
  let lineCount = 0;
  const maxLines = options.maxLines || Infinity;
  const content = text || "";

  for (let index = 0; index < content.length; index += 1) {
    const testLine = line + content[index];
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line) {
      if (lineCount >= maxLines - 1) {
        ctx.fillText(trimLineWithEllipsis(ctx, line + content.slice(index), maxWidth), x, currentY);
        return currentY + lineHeight;
      }

      ctx.fillText(line, x, currentY);
      lineCount += 1;
      line = content[index];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(maxLines === Infinity ? line : trimLineWithEllipsis(ctx, line, maxWidth), x, currentY);
    return currentY + lineHeight;
  }

  return currentY;
}

function trimLineWithEllipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let content = text;

  while (content.length > 1 && ctx.measureText(`${content}…`).width > maxWidth) {
    content = content.slice(0, -1);
  }

  return `${content}…`;
}
