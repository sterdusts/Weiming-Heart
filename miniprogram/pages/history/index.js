const {
  getActiveExplorationId,
  getExplorationHistory,
  switchExploration,
} = require("../../services/profile");

Page({
  data: {
    history: [],
    activeExplorationId: "",
  },

  onShow() {
    this.loadHistory();
  },

  loadHistory() {
    this.setData({
      history: getExplorationHistory(),
      activeExplorationId: getActiveExplorationId(),
    });
  },

  switchRecord(event) {
    const id = event.currentTarget.dataset.id;
    const profile = switchExploration(id);

    if (!profile) {
      wx.showToast({
        title: "没有找到这次探索",
        icon: "none",
      });
      return;
    }

    this.loadHistory();
    wx.showToast({
      title: "已切换探索",
      icon: "success",
    });

    clearTimeout(this.backTimer);
    this.backTimer = setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({
          delta: 1,
        });
        return;
      }

      wx.redirectTo({
        url: "/pages/index/index",
      });
    }, 420);
  },

  onUnload() {
    clearTimeout(this.backTimer);
  },
});
