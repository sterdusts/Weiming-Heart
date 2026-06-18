const PROFILE_KEY = "exploration_profile";
const HISTORY_KEY = "exploration_history";
const SUMMARY_KEY = "interviewSummary";
const ANSWERS_KEY = "interviewAnswers";
const COUNT_KEY = "exploration_count";
const ACTIVE_EXPLORATION_KEY = "active_exploration_id";
const CHAT_KEY = "exploration_chat_records";
const CHAT_SESSIONS_KEY = "exploration_chat_sessions";
const ACTIVE_CHAT_KEY = "active_exploration_chat_id";
const LEGACY_CHAT_MIGRATED_KEY = "exploration_chat_legacy_migrated";
const CLOUD_CHAT_FUNCTION = "chatStore";
const DEFAULT_EXPLORATION_ID = "default";

function getProfile() {
  return wx.getStorageSync(PROFILE_KEY) || null;
}

function getActiveExplorationId() {
  const activeId = wx.getStorageSync(ACTIVE_EXPLORATION_KEY);

  if (activeId) {
    return activeId;
  }

  const profile = getProfile();

  if (profile && profile.explorationId) {
    return profile.explorationId;
  }

  return DEFAULT_EXPLORATION_ID;
}

function saveProfileFromSummary(summary) {
  const cardSource = summary && summary.card ? summary.card : summary || {};
  const now = formatDate(new Date());
  const storedCount = Number(wx.getStorageSync(COUNT_KEY)) || 0;
  const previousProfile = getProfile();
  const previousCount = previousProfile && previousProfile.explorationCount
    ? Number(previousProfile.explorationCount) || 0
    : 0;
  const historyCount = getExplorationHistory().length;
  const baseCount = Math.max(storedCount, previousCount, historyCount);
  const explorationCount = baseCount + 1;
  const explorationId = cardSource.explorationId || buildExplorationId(explorationCount);
  const card = {
    ...cardSource,
    explorationId,
    explorationCount,
    explorationDate: cardSource.explorationDate || now,
  };
  const profile = {
    explorationId,
    card,
    explorationCount,
    createdAt: now,
    updatedAt: now,
  };

  wx.setStorageSync(COUNT_KEY, explorationCount);
  wx.setStorageSync(ACTIVE_EXPLORATION_KEY, explorationId);
  wx.setStorageSync(PROFILE_KEY, profile);
  return profile;
}

function getHistory() {
  const history = wx.getStorageSync(HISTORY_KEY);
  return repairCurrentProfileHistory(Array.isArray(history) ? history : []);
}

function appendHistory(record) {
  const history = getHistory();
  const card = getCardFromRecord(record);
  const type = record.type || "exploration";
  const nextRecord = {
    ...record,
    id: record.id || `history-${Date.now()}`,
    type,
    date: record.date || formatDate(new Date()),
    title: record.title || "一次新的探索",
    summary: record.summary || "",
    content: record.content || "",
  };

  if (type === "summary") {
    nextRecord.explorationId = record.explorationId || (card && card.explorationId) || buildExplorationId(record.explorationCount);
    nextRecord.explorationCount = Number(record.explorationCount || (card && card.explorationCount)) || undefined;
    nextRecord.card = {
      ...(card || {}),
      explorationId: nextRecord.explorationId,
      explorationCount: nextRecord.explorationCount,
      explorationDate: (card && card.explorationDate) || nextRecord.date,
    };
    nextRecord.content = JSON.stringify(nextRecord.card);
  }

  wx.setStorageSync(HISTORY_KEY, [nextRecord].concat(history).slice(0, 80));
  return nextRecord;
}

function getExplorationHistory() {
  const activeId = getActiveExplorationId();

  return getHistory()
    .filter((record) => record && record.type === "summary")
    .map((record, index) => normalizeExplorationRecord(record, index))
    .filter(Boolean)
    .map((record) => ({
      ...record,
      isActive: record.explorationId === activeId,
    }));
}

function switchExploration(explorationId) {
  const records = getExplorationHistory();
  const record = records.find((item) => item.explorationId === explorationId || item.id === explorationId);

  if (!record) {
    return null;
  }

  const card = {
    ...(record.card || {}),
    explorationId: record.explorationId,
    explorationCount: record.explorationCount,
    explorationDate: (record.card && record.card.explorationDate) || record.date,
  };
  const profile = {
    explorationId: record.explorationId,
    card,
    explorationCount: record.explorationCount,
    createdAt: record.createdAt || record.date || formatDate(new Date()),
    updatedAt: record.date || formatDate(new Date()),
  };

  wx.setStorageSync(ACTIVE_EXPLORATION_KEY, profile.explorationId);
  wx.setStorageSync(PROFILE_KEY, profile);
  wx.setStorageSync(SUMMARY_KEY, {
    card,
    conclusion: card.conclusion || record.summary || "",
  });
  if (Array.isArray(record.answers)) {
    wx.setStorageSync(ANSWERS_KEY, record.answers);
  } else {
    wx.removeStorageSync(ANSWERS_KEY);
  }
  activateFirstSession(getChatSessions());
  restoreChatSessionsFromCloud(profile.explorationId);
  return profile;
}

function getChatRecords() {
  const activeSession = getActiveChatSession();

  if (activeSession) {
    return activeSession.records || [];
  }

  const records = wx.getStorageSync(getScopedChatKey());
  return Array.isArray(records) ? records : [];
}

function saveChatRecords(records, meta) {
  const safeRecords = Array.isArray(records) ? records : [];
  const sessions = getChatSessions();
  const activeId = wx.getStorageSync(getScopedActiveChatKey());
  const now = formatDate(new Date());
  const nowMs = Date.now();
  const sessionIndex = sessions.findIndex((session) => session.id === activeId);

  if (sessionIndex === -1) {
    const session = createChatSession(safeRecords, meta);
    return session.records;
  }

  const current = sessions[sessionIndex];
  const nextSession = {
    ...current,
    title: meta && meta.title ? meta.title : current.title,
    summary: meta && meta.summary ? meta.summary : current.summary,
    updatedAt: now,
    updatedAtMs: nowMs,
    records: safeRecords.slice(-80),
  };
  const nextSessions = sessions.slice();
  nextSessions.splice(sessionIndex, 1);
  nextSessions.unshift(nextSession);

  wx.setStorageSync(getScopedChatSessionsKey(), nextSessions.slice(0, 30));
  wx.setStorageSync(getScopedChatKey(), nextSession.records);
  syncChatSessionToCloud(nextSession);
  return nextSession.records;
}

function deleteChatSession(id) {
  if (!id) {
    return getActiveChatSession();
  }

  deleteCloudChatSession(id);

  const sessions = getChatSessions();
  const nextSessions = sessions.filter((session) => session.id !== id);
  const activeId = wx.getStorageSync(getScopedActiveChatKey());

  wx.setStorageSync(getScopedChatSessionsKey(), nextSessions);

  if (activeId === id) {
    return activateFirstSession(nextSessions);
  }

  return getActiveChatSession();
}

function cleanupEmptyChatSessions() {
  const sessions = getChatSessions();

  if (!sessions.length) {
    return {
      removedCount: 0,
      activeSession: null,
      sessions: [],
    };
  }

  const nextSessions = sessions.filter((session) => !isEmptyChatSession(session));
  const removedCount = sessions.length - nextSessions.length;

  if (removedCount === 0) {
    return {
      removedCount,
      activeSession: getActiveChatSession(),
      sessions,
    };
  }

  wx.setStorageSync(getScopedChatSessionsKey(), nextSessions);
  const activeSession = activateFirstSession(nextSessions);

  return {
    removedCount,
    activeSession,
    sessions: nextSessions,
  };
}

function activateFirstSession(sessions) {
  const nextActive = Array.isArray(sessions) && sessions.length ? sessions[0] : null;

  if (nextActive) {
    wx.setStorageSync(getScopedActiveChatKey(), nextActive.id);
    wx.setStorageSync(getScopedChatKey(), nextActive.records || []);
    return nextActive;
  }

  wx.removeStorageSync(getScopedActiveChatKey());
  wx.removeStorageSync(getScopedChatKey());
  return null;
}

function isEmptyChatSession(session) {
  const records = session && Array.isArray(session.records) ? session.records : [];

  if (!records.length) {
    return true;
  }

  return !records.some((record) => {
    if (!record || record.type !== "user") {
      return false;
    }

    return typeof record.content === "string" && record.content.trim();
  });
}

function getChatSessions() {
  const scopedSessionsKey = getScopedChatSessionsKey();
  const sessions = wx.getStorageSync(scopedSessionsKey);

  if (Array.isArray(sessions) && sessions.length) {
    return sessions;
  }

  const migratedFrom = wx.getStorageSync(LEGACY_CHAT_MIGRATED_KEY);

  if (!migratedFrom) {
    const legacySessions = wx.getStorageSync(CHAT_SESSIONS_KEY);

    if (Array.isArray(legacySessions) && legacySessions.length) {
      const activeLegacyId = wx.getStorageSync(ACTIVE_CHAT_KEY) || legacySessions[0].id;
      wx.setStorageSync(scopedSessionsKey, legacySessions);
      wx.setStorageSync(getScopedActiveChatKey(), activeLegacyId);
      wx.setStorageSync(getScopedChatKey(), (legacySessions.find((item) => item.id === activeLegacyId) || legacySessions[0]).records || []);
      wx.setStorageSync(LEGACY_CHAT_MIGRATED_KEY, getActiveExplorationId());
      return legacySessions;
    }

    const legacyRecords = wx.getStorageSync(CHAT_KEY);

    if (Array.isArray(legacyRecords) && legacyRecords.length) {
      const migrated = buildChatSession(legacyRecords, {
        title: "之前的探索",
        summary: inferSessionSummary(legacyRecords),
      });

      wx.setStorageSync(scopedSessionsKey, [migrated]);
      wx.setStorageSync(getScopedActiveChatKey(), migrated.id);
      wx.setStorageSync(getScopedChatKey(), migrated.records);
      wx.setStorageSync(LEGACY_CHAT_MIGRATED_KEY, getActiveExplorationId());
      return [migrated];
    }
  }

  return [];
}

function getActiveChatSession() {
  const sessions = getChatSessions();
  const activeId = wx.getStorageSync(getScopedActiveChatKey());

  return sessions.find((session) => session.id === activeId) || sessions[0] || null;
}

function createChatSession(records, meta) {
  const safeRecords = Array.isArray(records) ? records.slice(-80) : [];
  const session = buildChatSession(safeRecords, meta);
  const sessions = getChatSessions().filter((item) => item.id !== session.id);

  wx.setStorageSync(getScopedChatSessionsKey(), [session].concat(sessions).slice(0, 30));
  wx.setStorageSync(getScopedActiveChatKey(), session.id);
  wx.setStorageSync(getScopedChatKey(), session.records);
  syncChatSessionToCloud(session);
  return session;
}

function switchChatSession(id) {
  const sessions = getChatSessions();
  const session = sessions.find((item) => item.id === id);

  if (!session) {
    return null;
  }

  wx.setStorageSync(getScopedActiveChatKey(), session.id);
  wx.setStorageSync(getScopedChatKey(), session.records || []);
  return session;
}

function buildChatSession(records, meta) {
  const now = formatDate(new Date());
  const nowMs = Date.now();
  const title = meta && meta.title ? meta.title : inferSessionTitle(records);

  return {
    id: meta && meta.id ? meta.id : `chat-${Date.now()}`,
    explorationId: getActiveExplorationId(),
    title,
    summary: meta && meta.summary ? meta.summary : inferSessionSummary(records),
    createdAt: now,
    updatedAt: now,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    records: records || [],
  };
}

function inferSessionTitle(records) {
  const userRecord = (records || []).find((record) => record && record.type === "user");
  const text = userRecord && userRecord.content ? String(userRecord.content).trim() : "";

  return text ? trimText(text, 14) : "新的探索";
}

function inferSessionSummary(records) {
  const aiRecord = (records || []).slice().reverse().find((record) => record && record.type === "ai");
  const content = aiRecord && aiRecord.content ? aiRecord.content : null;

  if (content && content.question) {
    return trimText(content.question, 28);
  }

  if (content && content.observation) {
    return trimText(content.observation, 28);
  }

  return "把一个问题继续拆开看。";
}

function trimText(text, maxLength) {
  const normalized = typeof text === "string" ? text.replace(/\s+/g, "") : "";

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

function resetCurrentExploration() {
  wx.removeStorageSync(PROFILE_KEY);
  wx.removeStorageSync(SUMMARY_KEY);
  wx.removeStorageSync(ANSWERS_KEY);
  wx.removeStorageSync(ACTIVE_EXPLORATION_KEY);
}

function repairCurrentProfileHistory(history) {
  if (!history.length) {
    return history;
  }

  const profile = getProfile();
  const profileCard = profile && profile.card;
  const activeId = profile && profile.explorationId;

  if (!profileCard || !activeId) {
    return history;
  }

  const hasActiveRecord = history.some((record) => {
    return record && record.type === "summary" && getRecordExplorationId(record) === activeId;
  });

  if (hasActiveRecord) {
    return history;
  }

  const matchIndex = history.findIndex((record) => isLikelyCurrentProfileRecord(record, profile));

  if (matchIndex === -1) {
    return history;
  }

  const record = history[matchIndex];
  const card = {
    ...(getCardFromRecord(record) || {}),
    ...profileCard,
    explorationId: activeId,
    explorationCount: Number(profile.explorationCount || profileCard.explorationCount) || record.explorationCount,
    explorationDate: profileCard.explorationDate || record.date || profile.updatedAt,
  };
  const repairedRecord = {
    ...record,
    date: record.date || card.explorationDate,
    explorationId: activeId,
    explorationCount: card.explorationCount,
    title: card.mainKeyword || record.title,
    summary: card.conclusion || record.summary,
    card,
    content: JSON.stringify(card),
  };

  const repairedHistory = history.slice();
  repairedHistory[matchIndex] = repairedRecord;
  wx.setStorageSync(HISTORY_KEY, repairedHistory);
  return repairedHistory;
}

function isLikelyCurrentProfileRecord(record, profile) {
  if (!record || record.type !== "summary" || !profile || !profile.card) {
    return false;
  }

  const card = getCardFromRecord(record) || {};
  const profileCard = profile.card;
  const titleMatches = sameStorageText(record.title || card.mainKeyword, profileCard.mainKeyword);
  const summaryMatches = sameStorageText(record.summary || card.conclusion, profileCard.conclusion);
  const dateMatches = sameStorageText(
    record.date || card.explorationDate,
    profileCard.explorationDate || profile.updatedAt || profile.createdAt
  );

  return (titleMatches && (summaryMatches || dateMatches)) || (summaryMatches && dateMatches);
}

function getRecordExplorationId(record) {
  const card = getCardFromRecord(record) || {};
  return normalizeStorageText(record.explorationId || card.explorationId);
}

function normalizeExplorationRecord(record, index) {
  const card = getCardFromRecord(record) || {};
  const explorationId = record.explorationId || card.explorationId || record.id || `legacy-${index}`;
  const explorationCount = Number(record.explorationCount) || inferExplorationCount(index);
  const normalizedCard = {
    ...card,
    explorationId,
    explorationCount,
    explorationDate: card.explorationDate || record.date,
    mainKeyword: card.mainKeyword || record.title || "一次探索",
    conclusion: card.conclusion || record.summary || "",
  };

  return {
    ...record,
    explorationId,
    explorationCount,
    card: normalizedCard,
    title: record.title || normalizedCard.mainKeyword,
    summary: record.summary || normalizedCard.conclusion,
  };
}

function inferExplorationCount(index) {
  const count = getHistory().filter((record) => record && record.type === "summary").length - index;
  return Math.max(1, count);
}

function getCardFromRecord(record) {
  if (!record) {
    return null;
  }

  if (record.card && typeof record.card === "object") {
    return record.card;
  }

  if (!record.content || typeof record.content !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(record.content);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function buildExplorationId(count) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `exploration-${Date.now()}-${count || suffix}`;
}

function getScopedChatKey(explorationId) {
  return `${CHAT_KEY}_${explorationId || getActiveExplorationId()}`;
}

function getScopedChatSessionsKey(explorationId) {
  return `${CHAT_SESSIONS_KEY}_${explorationId || getActiveExplorationId()}`;
}

function getScopedActiveChatKey(explorationId) {
  return `${ACTIVE_CHAT_KEY}_${explorationId || getActiveExplorationId()}`;
}

function restoreChatSessionsFromCloud(explorationId) {
  const targetExplorationId = explorationId || getActiveExplorationId();

  return callChatStore({
    action: "listSessions",
    explorationId: targetExplorationId,
  })
    .then((response) => {
      const result = response && response.result ? response.result : {};
      const cloudSessions = normalizeCloudSessions(result.sessions, targetExplorationId);

      if (!cloudSessions.length) {
        const localSessions = getStoredChatSessions(targetExplorationId);
        syncChatSessionsToCloud(localSessions);

        return {
          restored: false,
          sessions: localSessions,
          activeSession: getStoredActiveChatSession(targetExplorationId),
        };
      }

      const localSessions = getStoredChatSessions(targetExplorationId);
      const sessions = mergeChatSessions(localSessions, cloudSessions).slice(0, 30);
      const activeId = wx.getStorageSync(getScopedActiveChatKey(targetExplorationId));
      const activeSession = sessions.find((session) => session.id === activeId) || sessions[0] || null;

      wx.setStorageSync(getScopedChatSessionsKey(targetExplorationId), sessions);

      if (activeSession) {
        wx.setStorageSync(getScopedActiveChatKey(targetExplorationId), activeSession.id);
        wx.setStorageSync(getScopedChatKey(targetExplorationId), activeSession.records || []);
      }

      syncChatSessionsToCloud(sessions);

      return {
        restored: true,
        sessions,
        activeSession,
      };
    })
    .catch((error) => {
      warnCloudChat("restore", error);
      return {
        restored: false,
        sessions: getStoredChatSessions(targetExplorationId),
        activeSession: getStoredActiveChatSession(targetExplorationId),
      };
    });
}

function syncChatSessionToCloud(session) {
  const safeSession = normalizeChatSession(session, session && session.explorationId);

  if (!safeSession || isEmptyChatSession(safeSession)) {
    return Promise.resolve(null);
  }

  return callChatStore({
    action: "saveSession",
    explorationId: safeSession.explorationId,
    session: safeSession,
  }).catch((error) => {
    warnCloudChat("save", error);
    return null;
  });
}

function syncChatSessionsToCloud(sessions) {
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    syncChatSessionToCloud(session);
  });
}

function deleteCloudChatSession(id) {
  const sessionId = typeof id === "string" ? id.trim() : "";

  if (!sessionId) {
    return Promise.resolve(null);
  }

  return callChatStore({
    action: "deleteSession",
    explorationId: getActiveExplorationId(),
    sessionId,
  }).catch((error) => {
    warnCloudChat("delete", error);
    return null;
  });
}

function callChatStore(data) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error("wx.cloud.callFunction is unavailable."));
  }

  return wx.cloud.callFunction({
    name: CLOUD_CHAT_FUNCTION,
    data,
  });
}

function normalizeCloudSessions(sessions, explorationId) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions
    .map((session) => normalizeChatSession(session, explorationId))
    .filter(Boolean)
    .filter((session) => !isEmptyChatSession(session));
}

function normalizeChatSession(session, explorationId) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const id = normalizeId(session.id || session.sessionId);

  if (!id) {
    return null;
  }

  const targetExplorationId = normalizeId(session.explorationId || explorationId || getActiveExplorationId());
  const records = Array.isArray(session.records) ? session.records.slice(-80) : [];
  const now = formatDate(new Date());
  const nowMs = Date.now();
  const createdAtMs = normalizeTimestamp(session.createdAtMs, session.createdAt);
  const updatedAtMs = normalizeTimestamp(session.updatedAtMs, session.updatedAt);

  return {
    id,
    explorationId: targetExplorationId,
    title: typeof session.title === "string" && session.title.trim() ? session.title.trim() : inferSessionTitle(records),
    summary: typeof session.summary === "string" && session.summary.trim() ? session.summary.trim() : inferSessionSummary(records),
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
    createdAtMs: createdAtMs || nowMs,
    updatedAtMs: updatedAtMs || nowMs,
    records,
  };
}

function mergeChatSessions(localSessions, cloudSessions) {
  const byId = {};

  (Array.isArray(localSessions) ? localSessions : [])
    .map((session) => normalizeChatSession(session, session && session.explorationId))
    .filter(Boolean)
    .filter((session) => !isEmptyChatSession(session))
    .forEach((session) => {
      byId[session.id] = session;
    });

  cloudSessions.forEach((session) => {
    byId[session.id] = choosePreferredSession(byId[session.id], session);
  });

  return Object.keys(byId)
    .map((id) => byId[id])
    .sort((left, right) => {
      return (right.updatedAtMs || 0) - (left.updatedAtMs || 0);
    });
}

function choosePreferredSession(current, incoming) {
  if (!current) {
    return incoming;
  }

  const currentRecords = Array.isArray(current.records) ? current.records.length : 0;
  const incomingRecords = Array.isArray(incoming.records) ? incoming.records.length : 0;

  if (incomingRecords > currentRecords) {
    return incoming;
  }

  if (currentRecords > incomingRecords) {
    return current;
  }

  return (incoming.updatedAtMs || 0) >= (current.updatedAtMs || 0) ? incoming : current;
}

function getStoredChatSessions(explorationId) {
  const sessions = wx.getStorageSync(getScopedChatSessionsKey(explorationId));
  return Array.isArray(sessions) ? sessions : [];
}

function getStoredActiveChatSession(explorationId) {
  const sessions = getStoredChatSessions(explorationId);
  const activeId = wx.getStorageSync(getScopedActiveChatKey(explorationId));

  return sessions.find((session) => session.id === activeId) || sessions[0] || null;
}

function normalizeId(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function sameStorageText(left, right) {
  const normalizedLeft = normalizeStorageText(left);
  const normalizedRight = normalizeStorageText(right);

  return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
}

function normalizeStorageText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeTimestamp(value, fallbackDate) {
  const number = Number(value);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  if (typeof fallbackDate === "string" && fallbackDate) {
    const parsed = Date.parse(fallbackDate);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function warnCloudChat(action, error) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(`Cloud chat ${action} failed.`, error);
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

module.exports = {
  ACTIVE_CHAT_KEY,
  ACTIVE_EXPLORATION_KEY,
  ANSWERS_KEY,
  CHAT_KEY,
  CHAT_SESSIONS_KEY,
  COUNT_KEY,
  HISTORY_KEY,
  PROFILE_KEY,
  SUMMARY_KEY,
  appendHistory,
  cleanupEmptyChatSessions,
  createChatSession,
  deleteChatSession,
  formatDate,
  getActiveChatSession,
  getActiveExplorationId,
  getChatRecords,
  getChatSessions,
  getExplorationHistory,
  getHistory,
  getProfile,
  resetCurrentExploration,
  restoreChatSessionsFromCloud,
  saveChatRecords,
  saveProfileFromSummary,
  switchChatSession,
  switchExploration,
};
