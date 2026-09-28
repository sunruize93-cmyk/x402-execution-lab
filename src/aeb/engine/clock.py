from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Any


@dataclass(order=True)
class Scheduled:
    epoch: int
    order: int
    kind: str = field(compare=False)
    payload: Any = field(compare=False)


class Clock:
    def __init__(self):
        self.epoch = 0
        self.queue: list[Scheduled] = []
        self._order = 0

    def schedule(self, epoch: int, kind: str, payload: Any) -> None:
        if epoch < self.epoch:
            raise ValueError("Cannot schedule in the past")
        self._order += 1
        heapq.heappush(self.queue, Scheduled(epoch, self._order, kind, payload))

    def next_due(self, until: int) -> Scheduled | None:
        if not self.queue or self.queue[0].epoch > until:
            self.epoch = until
            return None
        event = heapq.heappop(self.queue)
        self.epoch = event.epoch
        return event
