import unittest

from greeting_policy import GreetingPolicy


class GreetingPolicyTests(unittest.TestCase):
    def test_first_arrival_and_duplicate_presence(self):
        policy = GreetingPolicy(cooldown_seconds=300)
        self.assertEqual(policy.arrive("ABHI", 100), "first")
        # A duplicate arrival must not trigger again, even after the cooldown,
        # while the same person has remained continuously present.
        self.assertIsNone(policy.arrive("abhi", 1000))

    def test_return_before_cooldown_is_suppressed(self):
        policy = GreetingPolicy(cooldown_seconds=300)
        self.assertEqual(policy.arrive("abhi", 100), "first")
        policy.depart("abhi")
        self.assertIsNone(policy.arrive("abhi", 399.9))

    def test_return_after_cooldown_uses_returning_greeting(self):
        policy = GreetingPolicy(cooldown_seconds=300)
        self.assertEqual(policy.arrive("abhi", 100), "first")
        policy.depart("abhi")
        self.assertEqual(policy.arrive("abhi", 400), "returning")

    def test_cooldown_is_per_user(self):
        policy = GreetingPolicy(cooldown_seconds=300)
        self.assertEqual(policy.arrive("abhi", 100), "first")
        self.assertEqual(policy.arrive("madhur", 100), "first")

    def test_empty_identity_does_not_greet(self):
        policy = GreetingPolicy()
        self.assertIsNone(policy.arrive("", 100))


if __name__ == "__main__":
    unittest.main()
