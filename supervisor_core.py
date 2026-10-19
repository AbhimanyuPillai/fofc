"""Small, dependency-free helpers shared by the booth launchers."""


class RestartBackoff:
    """Exponential retry delay that resets after a sufficiently stable run."""

    def __init__(self, initial_seconds=2, maximum_seconds=60, stable_after_seconds=300):
        if initial_seconds < 1 or maximum_seconds < initial_seconds:
            raise ValueError("Restart delay bounds are invalid")
        self.initial_seconds = initial_seconds
        self.maximum_seconds = maximum_seconds
        self.stable_after_seconds = stable_after_seconds
        self.failures = 0

    def delay_after_failure(self, runtime_seconds):
        if runtime_seconds >= self.stable_after_seconds:
            self.failures = 0
        delay = min(self.initial_seconds * (2 ** self.failures), self.maximum_seconds)
        self.failures += 1
        return delay
