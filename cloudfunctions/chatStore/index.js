const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION = "chat_sessions";
const SESSION_LIMIT = 30;
const RECORD_LIMIT = 80;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event && event.action;

  if (!openid) {
    throw new Error("Missing user identity.");
  }

  await ensureCollection();

  if (action === "listSessions") {
    return listSessions(openid, event && event.explorationId);
  }

  if (action === "saveSession") {
    return saveSession(openid, event && event.explorationId, event && event.session);
  }

  if (action === "deleteSession") {
    return deleteSession(openid, event && event.explorationId, event && event.sessionId);
  }

  throw new Error("Unsupported chat store action.");
};

async function listSessions(openid, explorationId) {
  const safeExplorationId = normalizeText(explorationId);

  if (!safeExplorationId) {
    return {
      sessions: [],
    };
  }

  const result = await db
    .collection(COLLECTION)
    .where({
      _openid: openid,
      explorationId: safeExplorationId,
    })
    .orderBy("updatedAtMs", "desc")
    .limit(SESSION_LIMIT)
    .get();

  return {
    sessions: (result.data || []).map((item) => ({
      id: item.sessionId || item.id,
      explorationId: item.explorationId,
      title: item.title,
      summary: item.summary,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdAtMs: item.createdAtMs || 0,
      updatedAtMs: item.updatedAtMs || 0,
      records: Array.isArray(item.records) ? item.records : [],
    })),
  };
}

async function saveSession(openid, explorationId, session) {
  const safeSession = sanitizeSession(session, explorationId);

  if (!safeSession) {
    throw new Error("Invalid chat session.");
  }

  const collection = db.collection(COLLECTION);
  const existing = await collection
    .where({
      _openid: openid,
      explorationId: safeSession.explorationId,
      sessionId: safeSession.id,
    })
    .limit(1)
    .get();

  const data = {
    sessionId: safeSession.id,
    explorationId: safeSession.explorationId,
    title: safeSession.title,
    summary: safeSession.summary,
    createdAt: safeSession.createdAt,
    updatedAt: safeSession.updatedAt,
    createdAtMs: safeSession.createdAtMs,
    updatedAtMs: safeSession.updatedAtMs,
    records: safeSession.records,
    cloudUpdatedAt: db.serverDate(),
  };

  if (existing.data && existing.data.length) {
    await collection.doc(existing.data[0]._id).update({
      data,
    });
    return {
      id: existing.data[0]._id,
      updated: true,
    };
  }

  const result = await collection.add({
    data: {
      ...data,
      _openid: openid,
    },
  });

  return {
    id: result._id,
    created: true,
  };
}

async function deleteSession(openid, explorationId, sessionId) {
  const safeExplorationId = normalizeText(explorationId);
  const safeSessionId = normalizeText(sessionId);

  if (!safeExplorationId || !safeSessionId) {
    return {
      deleted: 0,
    };
  }

  const collection = db.collection(COLLECTION);
  const existing = await collection
    .where({
      _openid: openid,
      explorationId: safeExplorationId,
      sessionId: safeSessionId,
    })
    .limit(10)
    .get();

  await Promise.all(
    (existing.data || []).map((item) => collection.doc(item._id).remove())
  );

  return {
    deleted: existing.data ? existing.data.length : 0,
  };
}

async function ensureCollection() {
  try {
    await db.collection(COLLECTION).limit(1).get();
  } catch (error) {
    if (typeof db.createCollection !== "function") {
      throw error;
    }

    try {
      await db.createCollection(COLLECTION);
    } catch (innerError) {
      const message = innerError && innerError.message ? innerError.message : "";

      if (!/exist/i.test(message)) {
        throw innerError;
      }
    }
  }
}

function sanitizeSession(session, explorationId) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const id = normalizeText(session.id || session.sessionId);
  const safeExplorationId = normalizeText(session.explorationId || explorationId);

  if (!id || !safeExplorationId) {
    return null;
  }

  const now = Date.now();
  const records = Array.isArray(session.records)
    ? session.records.slice(-RECORD_LIMIT).map(sanitizeRecord).filter(Boolean)
    : [];

  return {
    id,
    explorationId: safeExplorationId,
    title: normalizeText(session.title).slice(0, 60) || "New chat",
    summary: normalizeText(session.summary).slice(0, 120),
    createdAt: normalizeText(session.createdAt) || formatDate(now),
    updatedAt: normalizeText(session.updatedAt) || formatDate(now),
    createdAtMs: normalizeNumber(session.createdAtMs) || now,
    updatedAtMs: normalizeNumber(session.updatedAtMs) || now,
    records,
  };
}

function sanitizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.type !== "user" && record.type !== "ai") {
    return null;
  }

  return {
    id: normalizeText(record.id) || `${record.type}-${Date.now()}`,
    type: record.type,
    content: sanitizeContent(record.content),
  };
}

function sanitizeContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  return JSON.parse(JSON.stringify(content));
}

function normalizeText(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
