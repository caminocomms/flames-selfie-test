import time
from collections import deque


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


class InProcessRateLimiter:
    def __init__(self, per_minute: int, per_day: int) -> None:
        self.per_minute = per_minute
        self.per_day = per_day
        self._minute: dict[str, deque[float]] = {}
        self._day: dict[str, deque[float]] = {}

    def check(self, key: str) -> None:
        now = time.time()
        minute_window = 60.0
        day_window = 86400.0

        minute_q = self._minute.setdefault(key, deque())
        day_q = self._day.setdefault(key, deque())

        while minute_q and minute_q[0] <= now - minute_window:
            minute_q.popleft()
        while day_q and day_q[0] <= now - day_window:
            day_q.popleft()

        if len(minute_q) >= self.per_minute:
            retry_after = int(max(1.0, (minute_q[0] + minute_window) - now))
            raise RateLimitExceeded(retry_after_seconds=retry_after)

        if len(day_q) >= self.per_day:
            retry_after = int(max(60.0, (day_q[0] + day_window) - now))
            raise RateLimitExceeded(retry_after_seconds=retry_after)

        minute_q.append(now)
        day_q.append(now)

