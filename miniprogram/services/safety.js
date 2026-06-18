const toneInstruction = [
  "禁止使用绝对化表达：天生、注定、一定、最适合、命中注定、你的性格就是。",
  "优先使用观察式表达：似乎、也许、可能、我看到、或许、值得继续观察。",
].join("\n");

function sanitizeText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim();
}

function sanitizeList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(sanitizeText).filter(Boolean);
}

function sanitizeCard(card) {
  if (!card) {
    return card;
  }

  return {
    ...card,
    mainKeyword: sanitizeText(card.mainKeyword),
    subtitle: sanitizeText(card.subtitle),
    subKeywords: sanitizeText(card.subKeywords),
    conclusion: sanitizeText(card.conclusion),
  };
}

module.exports = {
  sanitizeCard,
  sanitizeList,
  sanitizeText,
  toneInstruction,
};
