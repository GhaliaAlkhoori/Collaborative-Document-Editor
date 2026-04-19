function tokenizeText(text) {
  return text.match(/\s+|\w+|[^\s\w]/gu) || [];
}

function diffTokens(sourceTokens, suggestionTokens) {
  const sourceLength = sourceTokens.length;
  const suggestionLength = suggestionTokens.length;
  const table = Array.from({ length: sourceLength + 1 }, () =>
    Array(suggestionLength + 1).fill(0)
  );

  for (let sourceIndex = sourceLength - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let suggestionIndex = suggestionLength - 1; suggestionIndex >= 0; suggestionIndex -= 1) {
      if (sourceTokens[sourceIndex] === suggestionTokens[suggestionIndex]) {
        table[sourceIndex][suggestionIndex] = table[sourceIndex + 1][suggestionIndex + 1] + 1;
      } else {
        table[sourceIndex][suggestionIndex] = Math.max(
          table[sourceIndex + 1][suggestionIndex],
          table[sourceIndex][suggestionIndex + 1]
        );
      }
    }
  }

  const entries = [];
  let sourceIndex = 0;
  let suggestionIndex = 0;

  while (sourceIndex < sourceLength && suggestionIndex < suggestionLength) {
    if (sourceTokens[sourceIndex] === suggestionTokens[suggestionIndex]) {
      entries.push({ type: "equal", text: sourceTokens[sourceIndex] });
      sourceIndex += 1;
      suggestionIndex += 1;
      continue;
    }

    if (table[sourceIndex + 1][suggestionIndex] >= table[sourceIndex][suggestionIndex + 1]) {
      entries.push({ type: "delete", text: sourceTokens[sourceIndex] });
      sourceIndex += 1;
    } else {
      entries.push({ type: "insert", text: suggestionTokens[suggestionIndex] });
      suggestionIndex += 1;
    }
  }

  while (sourceIndex < sourceLength) {
    entries.push({ type: "delete", text: sourceTokens[sourceIndex] });
    sourceIndex += 1;
  }

  while (suggestionIndex < suggestionLength) {
    entries.push({ type: "insert", text: suggestionTokens[suggestionIndex] });
    suggestionIndex += 1;
  }

  return entries;
}

export function buildSuggestionBlocks(sourceText, suggestionText) {
  const entries = diffTokens(tokenizeText(sourceText), tokenizeText(suggestionText));
  const blocks = [];
  let pendingBefore = "";
  let pendingAfter = "";
  let changeIndex = 0;

  function flushChange() {
    if (!pendingBefore && !pendingAfter) {
      return;
    }

    blocks.push({
      id: `change-${changeIndex}`,
      type: "change",
      before: pendingBefore,
      after: pendingAfter,
      accepted: true,
    });

    changeIndex += 1;
    pendingBefore = "";
    pendingAfter = "";
  }

  for (const entry of entries) {
    if (entry.type === "equal") {
      flushChange();
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "equal") {
        previous.text += entry.text;
      } else {
        blocks.push({
          id: `equal-${blocks.length}`,
          type: "equal",
          text: entry.text,
        });
      }
      continue;
    }

    if (entry.type === "delete") {
      pendingBefore += entry.text;
    } else {
      pendingAfter += entry.text;
    }
  }

  flushChange();

  if (!blocks.length) {
    blocks.push({
      id: "equal-0",
      type: "equal",
      text: suggestionText,
    });
  }

  return blocks;
}

export function composeSuggestionText(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "equal") {
        return block.text;
      }

      return block.accepted ? block.after : block.before;
    })
    .join("");
}

export function countReviewChanges(blocks) {
  return blocks.filter((block) => block.type === "change").length;
}
