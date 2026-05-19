"""Constants for pay-period planning (pull-forward, item types)."""

ITEM_TYPE_BILL = "bill"
ITEM_TYPE_DEBT = "debt"

ITEM_TYPES = frozenset({ITEM_TYPE_BILL, ITEM_TYPE_DEBT})

# v1: only next pay period -> current pay period
OVERRIDE_PULL_FORWARD = "pull_forward"

OVERRIDE_TYPES_V1 = frozenset({OVERRIDE_PULL_FORWARD})
