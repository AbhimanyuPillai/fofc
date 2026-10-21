import unittest
from unittest.mock import patch

import projection_bridge


class ProjectionBridgeAliasTests(unittest.TestCase):
    def find_with_products(self, products, utterance):
        with patch.dict(projection_bridge._catalog_by_id, products, clear=True):
            return projection_bridge.find_product_by_text(utterance)

    def test_catalog_alias_matches_only_its_product(self):
        products = {
            9: {"id": 9, "name": "RFID", "aliases": ["r f i d", "are f i d"]},
            10: {"id": 10, "name": "Secure Fueling", "aliases": ["secure fuelling"]},
        }

        match = self.find_with_products(products, "Tell me about are F I D")

        self.assertEqual(match["id"], 9)

    def test_normalized_product_name_matches_without_catalog_aliases(self):
        products = {1: {"id": 1, "name": "SMART#C"}}

        match = self.find_with_products(products, "What does Smart C do?")

        self.assertEqual(match["id"], 1)

    def test_ambiguous_alias_returns_no_product(self):
        products = {
            1: {"id": 1, "name": "Board One", "aliases": ["control board"]},
            2: {"id": 2, "name": "Board Two", "aliases": ["control board"]},
        }

        self.assertIsNone(self.find_with_products(products, "Tell me about the control board"))

    def test_spoken_name_is_not_used_as_an_input_alias(self):
        products = {4: {"id": 4, "name": "IS-Barrier", "spokenName": "I. S. Barrier"}}

        self.assertIsNone(self.find_with_products(products, "Tell me about ice barrier"))


if __name__ == "__main__":
    unittest.main()
