function componentLength(component) {
  if (component.type === "insert") {
    return component.text.length;
  }

  return Number(component.count || 0);
}

function pushComponent(target, component) {
  const length = componentLength(component);
  if (length <= 0) {
    return;
  }

  if (component.type === "insert" && !component.text) {
    return;
  }

  const previous = target[target.length - 1];
  if (previous && previous.type === component.type) {
    if (component.type === "insert") {
      previous.text += component.text;
    } else {
      previous.count += Number(component.count);
    }
    return;
  }

  if (component.type === "insert") {
    target.push({ type: "insert", text: component.text });
    return;
  }

  target.push({ type: component.type, count: Number(component.count) });
}

export function normalizeOperation(operation) {
  const normalized = [];

  for (const rawComponent of operation || []) {
    if (!rawComponent || !["retain", "insert", "delete"].includes(rawComponent.type)) {
      continue;
    }

    if (rawComponent.type === "insert") {
      pushComponent(normalized, {
        type: "insert",
        text: String(rawComponent.text || ""),
      });
    } else {
      pushComponent(normalized, {
        type: rawComponent.type,
        count: Number(rawComponent.count || 0),
      });
    }
  }

  while (normalized.length && normalized[normalized.length - 1].type === "retain") {
    normalized.pop();
  }

  return normalized;
}

export function operationHasChanges(operation) {
  return normalizeOperation(operation).some((component) => component.type !== "retain");
}

export function diffToOperation(before, after) {
  if (before === after) {
    return [];
  }

  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let beforeSuffix = before.length;
  let afterSuffix = after.length;
  while (
    beforeSuffix > prefix &&
    afterSuffix > prefix &&
    before[beforeSuffix - 1] === after[afterSuffix - 1]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const operation = [];
  if (prefix) {
    operation.push({ type: "retain", count: prefix });
  }

  const deleted = before.slice(prefix, beforeSuffix);
  const inserted = after.slice(prefix, afterSuffix);

  if (deleted) {
    operation.push({ type: "delete", count: deleted.length });
  }

  if (inserted) {
    operation.push({ type: "insert", text: inserted });
  }

  const suffix = before.length - beforeSuffix;
  if (suffix) {
    operation.push({ type: "retain", count: suffix });
  }

  return normalizeOperation(operation);
}

export function applyTextOperation(text, operation) {
  let cursor = 0;
  const output = [];

  for (const component of normalizeOperation(operation)) {
    if (component.type === "retain") {
      const count = Number(component.count);
      output.push(text.slice(cursor, cursor + count));
      cursor += count;
    } else if (component.type === "insert") {
      output.push(component.text);
    } else {
      cursor += Number(component.count);
    }
  }

  output.push(text.slice(cursor));
  return output.join("");
}

class OperationIterator {
  constructor(operation) {
    this.operation = normalizeOperation(operation);
    this.index = 0;
    this.offset = 0;
  }

  hasNext() {
    return this.index < this.operation.length;
  }

  peekType() {
    if (!this.hasNext()) {
      return "retain";
    }

    return this.operation[this.index].type;
  }

  peekLength() {
    if (!this.hasNext()) {
      return Number.MAX_SAFE_INTEGER;
    }

    return componentLength(this.operation[this.index]) - this.offset;
  }

  take(length) {
    if (!this.hasNext()) {
      return { type: "retain", count: length ?? 0 };
    }

    const component = this.operation[this.index];
    const remaining = componentLength(component) - this.offset;
    const takeLength = length == null ? remaining : Math.min(length, remaining);

    let fragment;
    if (component.type === "insert") {
      fragment = {
        type: "insert",
        text: component.text.slice(this.offset, this.offset + takeLength),
      };
    } else {
      fragment = {
        type: component.type,
        count: takeLength,
      };
    }

    this.offset += takeLength;
    if (this.offset >= componentLength(component)) {
      this.index += 1;
      this.offset = 0;
    }

    return fragment;
  }
}

export function transformOperation(operation, otherOperation, side) {
  if (!["left", "right"].includes(side)) {
    throw new Error("side must be 'left' or 'right'");
  }

  const iterator = new OperationIterator(operation);
  const otherIterator = new OperationIterator(otherOperation);
  const transformed = [];

  while (iterator.hasNext() || otherIterator.hasNext()) {
    if (
      iterator.peekType() === "insert" &&
      (side === "left" || otherIterator.peekType() !== "insert")
    ) {
      pushComponent(transformed, iterator.take());
      continue;
    }

    if (otherIterator.peekType() === "insert") {
      const otherInsert = otherIterator.take();
      pushComponent(transformed, { type: "retain", count: otherInsert.text.length });
      continue;
    }

    const length = Math.min(iterator.peekLength(), otherIterator.peekLength());
    const component = iterator.take(length);
    const otherComponent = otherIterator.take(length);

    if (component.type === "retain" && otherComponent.type === "retain") {
      pushComponent(transformed, { type: "retain", count: length });
    } else if (component.type === "delete" && otherComponent.type === "retain") {
      pushComponent(transformed, { type: "delete", count: length });
    } else if (
      (component.type === "retain" && otherComponent.type === "delete") ||
      (component.type === "delete" && otherComponent.type === "delete")
    ) {
      continue;
    } else {
      throw new Error("Unsupported transform state");
    }
  }

  return normalizeOperation(transformed);
}

export function transformPair(operationA, operationB, aGoesLeft) {
  const normalizedA = normalizeOperation(operationA);
  const normalizedB = normalizeOperation(operationB);

  return [
    transformOperation(normalizedA, normalizedB, aGoesLeft ? "left" : "right"),
    transformOperation(normalizedB, normalizedA, aGoesLeft ? "right" : "left"),
  ];
}

export function transformIndex(index, operation, stick = "right") {
  if (!["left", "right"].includes(stick)) {
    throw new Error("stick must be 'left' or 'right'");
  }

  const safeIndex = Math.max(0, Number(index || 0));
  let oldCursor = 0;
  let newCursor = 0;

  for (const component of normalizeOperation(operation)) {
    if (component.type === "retain") {
      const count = Number(component.count);
      if (safeIndex < oldCursor + count) {
        return newCursor + (safeIndex - oldCursor);
      }
      oldCursor += count;
      newCursor += count;
      continue;
    }

    if (component.type === "insert") {
      const insertLength = component.text.length;
      if (oldCursor < safeIndex || (oldCursor === safeIndex && stick === "right")) {
        newCursor += insertLength;
      }
      continue;
    }

    const count = Number(component.count);
    if (safeIndex < oldCursor + count) {
      return newCursor;
    }
    oldCursor += count;
  }

  return newCursor + Math.max(0, safeIndex - oldCursor);
}
