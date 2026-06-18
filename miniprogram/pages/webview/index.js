Page({
  data: {
    url: "",
    title: "参考来源",
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || "");
    const title = decodeURIComponent(options.title || "参考来源");

    if (title) {
      wx.setNavigationBarTitle({
        title: title.slice(0, 12),
      });
    }

    this.setData({
      url: /^https?:\/\//i.test(url) ? url : "",
      title,
    });
  },

  onWebError() {
    if (!this.data.url) {
      return;
    }

    wx.showModal({
      title: "来源暂时无法打开",
      content: "可能是小程序还没有配置该网页域名。是否复制链接到剪贴板？",
      confirmText: "复制",
      cancelText: "返回",
      success: (res) => {
        if (res.confirm) {
          this.copyUrl();
          return;
        }

        wx.navigateBack();
      },
    });
  },

  copyUrl() {
    wx.setClipboardData({
      data: this.data.url,
      success: () => {
        wx.showToast({
          title: "链接已复制",
          icon: "success",
        });
      },
    });
  },
});
