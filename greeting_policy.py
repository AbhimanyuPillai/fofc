"""Per-user greeting cooldown and first/returning greeting selection."""

import threading


class GreetingPolicy:
    """Greet on a person's arrival, with a cooldown between separate visits."""

    def __init__(self, cooldown_seconds=300):
        if cooldown_seconds < 0:
            raise ValueError("cooldown_seconds cannot be negative")
        self.cooldown_seconds = float(cooldown_seconds)
        self._lock = threading.Lock()
        self._active_users = set()
        self._last_greeted_at = {}

    def arrive(self, user_key, now):
        """Return 'first', 'returning', or None when no greeting is due."""
        key = str(user_key or "").strip().casefold()
        if not key:
            return None
        now = float(now)
        with self._lock:
            if key in self._active_users:
                return None
            self._active_users.add(key)
            last_greeted = self._last_greeted_at.get(key)
            if last_greeted is not None and now - last_greeted < self.cooldown_seconds:
                return None
            self._last_greeted_at[key] = now
            return "returning" if last_greeted is not None else "first"

    def depart(self, user_key):
        key = str(user_key or "").strip().casefold()
        if not key:
            return
        with self._lock:
            self._active_users.discard(key)
