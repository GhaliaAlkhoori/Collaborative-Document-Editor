from app.text_ops import apply_operation, diff_to_operation, transform_pair


def test_diff_to_operation_round_trips_text_changes():
    """Verify the diff helper emits an operation that reproduces the edited text when applied."""
    before = "Hello world"
    after = "Hello collaborative world"

    operation = diff_to_operation(before, after)

    assert apply_operation(before, operation) == after


def test_transform_pair_converges_two_concurrent_edits():
    """Verify the OT transform keeps concurrent edits lossless by converging both application orders."""
    base = "abcd"
    insert_operation = [
        {"type": "retain", "count": 1},
        {"type": "insert", "text": "X"},
        {"type": "retain", "count": 3},
    ]
    delete_operation = [
        {"type": "retain", "count": 2},
        {"type": "delete", "count": 1},
        {"type": "retain", "count": 1},
    ]

    insert_prime, delete_prime = transform_pair(insert_operation, delete_operation, True)

    left_first = apply_operation(apply_operation(base, insert_operation), delete_prime)
    right_first = apply_operation(apply_operation(base, delete_operation), insert_prime)

    assert left_first == right_first == "aXbd"
