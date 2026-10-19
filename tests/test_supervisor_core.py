import unittest

from supervisor_core import RestartBackoff


class RestartBackoffTests(unittest.TestCase):
    def test_delay_grows_and_caps(self):
        policy = RestartBackoff(initial_seconds=2, maximum_seconds=10)
        self.assertEqual([policy.delay_after_failure(1) for _ in range(5)], [2, 4, 8, 10, 10])

    def test_stable_runtime_resets_backoff(self):
        policy = RestartBackoff(initial_seconds=2, maximum_seconds=60, stable_after_seconds=300)
        self.assertEqual(policy.delay_after_failure(10), 2)
        self.assertEqual(policy.delay_after_failure(10), 4)
        self.assertEqual(policy.delay_after_failure(300), 2)

    def test_short_runtime_does_not_reset_backoff(self):
        policy = RestartBackoff(initial_seconds=2, maximum_seconds=60, stable_after_seconds=300)
        self.assertEqual(policy.delay_after_failure(10), 2)
        self.assertEqual(policy.delay_after_failure(299), 4)

    def test_invalid_bounds_are_rejected(self):
        with self.assertRaises(ValueError):
            RestartBackoff(initial_seconds=10, maximum_seconds=5)


if __name__ == "__main__":
    unittest.main()
