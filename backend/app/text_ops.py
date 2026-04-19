from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Literal


OperationComponent = Dict[str, Any]
Operation = List[OperationComponent]
TransformSide = Literal["left", "right"]


def _component_length(component: OperationComponent) -> int:
    kind = component["type"]
    if kind == "insert":
        return len(component["text"])
    return int(component["count"])


def _push_component(target: Operation, component: OperationComponent) -> None:
    kind = component["type"]
    length = _component_length(component)

    if length <= 0:
        return

    if kind == "insert" and not component["text"]:
        return

    if target and target[-1]["type"] == kind:
        if kind == "insert":
            target[-1]["text"] += component["text"]
        else:
            target[-1]["count"] += component["count"]
        return

    if kind == "insert":
        target.append({"type": "insert", "text": component["text"]})
    else:
        target.append({"type": kind, "count": int(component["count"])})


def normalize_operation(operation: Iterable[OperationComponent] | None) -> Operation:
    normalized: Operation = []

    for raw_component in operation or []:
        kind = raw_component.get("type")
        if kind not in {"retain", "insert", "delete"}:
            continue

        if kind == "insert":
            _push_component(normalized, {"type": "insert", "text": str(raw_component.get("text", ""))})
        else:
            _push_component(normalized, {"type": kind, "count": int(raw_component.get("count", 0))})

    while normalized and normalized[-1]["type"] == "retain":
        normalized.pop()

    return normalized


def operation_has_changes(operation: Iterable[OperationComponent] | None) -> bool:
    return any(component["type"] != "retain" for component in normalize_operation(operation))


def diff_to_operation(before: str, after: str) -> Operation:
    if before == after:
        return []

    prefix = 0
    max_prefix = min(len(before), len(after))
    while prefix < max_prefix and before[prefix] == after[prefix]:
        prefix += 1

    before_suffix = len(before)
    after_suffix = len(after)
    while before_suffix > prefix and after_suffix > prefix and before[before_suffix - 1] == after[after_suffix - 1]:
        before_suffix -= 1
        after_suffix -= 1

    operation: Operation = []
    if prefix:
        operation.append({"type": "retain", "count": prefix})

    deleted = before[prefix:before_suffix]
    inserted = after[prefix:after_suffix]

    if deleted:
        operation.append({"type": "delete", "count": len(deleted)})

    if inserted:
        operation.append({"type": "insert", "text": inserted})

    suffix = len(before) - before_suffix
    if suffix:
        operation.append({"type": "retain", "count": suffix})

    return normalize_operation(operation)


def apply_operation(text: str, operation: Iterable[OperationComponent] | None) -> str:
    cursor = 0
    output: List[str] = []

    for component in normalize_operation(operation):
        kind = component["type"]
        if kind == "retain":
            count = int(component["count"])
            output.append(text[cursor:cursor + count])
            cursor += count
        elif kind == "insert":
            output.append(component["text"])
        else:
            cursor += int(component["count"])

    output.append(text[cursor:])
    return "".join(output)


@dataclass
class _OperationIterator:
    operation: Operation
    index: int = 0
    offset: int = 0

    def has_next(self) -> bool:
        return self.index < len(self.operation)

    def peek_type(self) -> str:
        if not self.has_next():
            return "retain"
        return self.operation[self.index]["type"]

    def peek_length(self) -> int:
        if not self.has_next():
            return 10**12
        component = self.operation[self.index]
        return _component_length(component) - self.offset

    def take(self, length: int | None = None) -> OperationComponent:
        if not self.has_next():
            return {"type": "retain", "count": 0 if length is None else length}

        component = self.operation[self.index]
        remaining = _component_length(component) - self.offset
        take_length = remaining if length is None else min(length, remaining)

        if component["type"] == "insert":
            fragment = {"type": "insert", "text": component["text"][self.offset:self.offset + take_length]}
        else:
            fragment = {"type": component["type"], "count": take_length}

        self.offset += take_length
        if self.offset >= _component_length(component):
            self.index += 1
            self.offset = 0

        return fragment


def transform_operation(
    operation: Iterable[OperationComponent] | None,
    other_operation: Iterable[OperationComponent] | None,
    side: TransformSide,
) -> Operation:
    if side not in {"left", "right"}:
        raise ValueError("side must be 'left' or 'right'")

    op_iter = _OperationIterator(normalize_operation(operation))
    other_iter = _OperationIterator(normalize_operation(other_operation))
    transformed: Operation = []

    while op_iter.has_next() or other_iter.has_next():
        if op_iter.peek_type() == "insert" and (side == "left" or other_iter.peek_type() != "insert"):
            insert_component = op_iter.take()
            _push_component(transformed, insert_component)
            continue

        if other_iter.peek_type() == "insert":
            insert_component = other_iter.take()
            _push_component(transformed, {"type": "retain", "count": len(insert_component["text"])})
            continue

        length = min(op_iter.peek_length(), other_iter.peek_length())
        op_component = op_iter.take(length)
        other_component = other_iter.take(length)

        if op_component["type"] == "retain" and other_component["type"] == "retain":
            _push_component(transformed, {"type": "retain", "count": length})
        elif op_component["type"] == "delete" and other_component["type"] == "retain":
            _push_component(transformed, {"type": "delete", "count": length})
        elif op_component["type"] == "retain" and other_component["type"] == "delete":
            continue
        elif op_component["type"] == "delete" and other_component["type"] == "delete":
            continue
        else:
            raise ValueError("Unsupported operation transform state")

    return normalize_operation(transformed)


def transform_pair(
    operation_a: Iterable[OperationComponent] | None,
    operation_b: Iterable[OperationComponent] | None,
    a_goes_left: bool,
) -> tuple[Operation, Operation]:
    normalized_a = normalize_operation(operation_a)
    normalized_b = normalize_operation(operation_b)
    side_for_a: TransformSide = "left" if a_goes_left else "right"
    side_for_b: TransformSide = "right" if a_goes_left else "left"
    return (
        transform_operation(normalized_a, normalized_b, side_for_a),
        transform_operation(normalized_b, normalized_a, side_for_b),
    )


def transform_index(index: int, operation: Iterable[OperationComponent] | None, stick: TransformSide = "right") -> int:
    if stick not in {"left", "right"}:
        raise ValueError("stick must be 'left' or 'right'")

    index = max(0, int(index))
    old_cursor = 0
    new_cursor = 0

    for component in normalize_operation(operation):
        kind = component["type"]

        if kind == "retain":
            count = int(component["count"])
            if index < old_cursor + count:
                return new_cursor + (index - old_cursor)
            old_cursor += count
            new_cursor += count
            continue

        if kind == "insert":
            insert_length = len(component["text"])
            if old_cursor < index or (old_cursor == index and stick == "right"):
                new_cursor += insert_length
            continue

        count = int(component["count"])
        if index < old_cursor + count:
            return new_cursor
        old_cursor += count

    return new_cursor + max(0, index - old_cursor)
