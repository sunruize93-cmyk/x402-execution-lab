from __future__ import annotations

from collections import defaultdict


class Ledger:
    """Cash accounts use zero-sum postings; spent/receivable are view counters.

    Reserved cash remains the buyer's asset. Receivable is a memo claim and
    cannot fund an action. A refund changes cash only when evidence arrives.
    """

    def __init__(self, budget: int):
        self.initial = budget
        self.balances: dict[str, int] = defaultdict(int, {"buyer.available": budget})

    def transfer(self, source: str, target: str, amount: int, reason: str) -> dict:
        if type(amount) is not int or amount < 0:
            raise ValueError("Postings require nonnegative integer atomic amounts")
        if self.balances[source] < amount:
            raise ValueError(f"Insufficient cash in {source}")
        entry = {
            "reason": reason,
            "postings": [
                {"account": source, "delta": -amount},
                {"account": target, "delta": amount},
            ],
        }
        self.apply(entry)
        return entry

    def apply(self, entry: dict) -> None:
        changes: dict[str, int] = defaultdict(int)
        for posting in entry["postings"]:
            if type(posting["delta"]) is not int:
                raise ValueError("Fractional posting")
            changes[posting["account"]] += posting["delta"]
        if sum(changes.values()) != 0:
            raise ValueError("Unbalanced entry")
        if any(self.balances[a] + delta < 0 for a, delta in changes.items()):
            raise ValueError("Negative cash balance")
        for account, delta in changes.items():
            self.balances[account] += delta
        self.check()

    def check(self) -> None:
        if sum(self.balances.values()) != self.initial or min(self.balances.values()) < 0:
            raise AssertionError("Cash conservation violated")

    def buyer(self, receivable: int = 0) -> dict:
        available = self.balances["buyer.available"]
        reserved = self.balances["buyer.reserved"]
        return {
            "available": available,
            "reserved": reserved,
            "spent": self.initial - available - reserved,
            "receivable": receivable,
        }
