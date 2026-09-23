# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A card that proposes changing a document must say whose document it is.

WHAT HAPPENED, ON THE OTHER ERP (2026-09-22)

	An invoice was written to the wrong customer. It was then approved, posted
	under a real invoice number, reversed, re-entered and corrected across six
	separate approval rounds — and in none of those rounds did the wrong name
	appear on screen. Every card said the same thing:

		this document now: Draft Invoice — 8000.0, YourCompany

	which is a truthful description of that document and of every other draft
	invoice on the database for the same amount. The customer only found out
	when they opened the record themselves.

WHY IT REACHES HERE

	`search_documents` has published a `party` for every row since it was
	written. `get_document_state` — the route that answers "what IS this
	document", and the one that fills the line above — did not. So one client
	reading both routes was told two different things about one document, and
	the route used at the moment of approval was the blind one.

	The reference is usually enough on ERPNext, where a document is called
	ACC-SINV-2026-00026 and an accountant recognises it. It is not enough for
	a document whose reference is a database id, and it is not enough for
	anyone checking that the agent picked the invoice they meant. The party is
	the fact a person notices is wrong.

A DOCUMENT WITH NO COUNTERPARTY ANSWERS NOTHING, and that is correct: an Item
and a Company have no party, and inventing one is worse than leaving it out.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_document_says_who_it_is_with
"""

import unittest

from accountant_agent.agent_api.services.agent_write_service import _document_party


class _Doc(dict):
	"""A document as `_document_party` reads one: `.get(fieldname)`.

	A `frappe.Document` answers `.get` for a field its DocType does not have
	with None rather than raising, which is the behaviour this ladder depends
	on — it walks six field names and most documents carry at most one.
	"""


class ADocumentSaysWhoItIsWith(unittest.TestCase):

	def test_a_sales_document_answers_with_the_customer(self):
		self.assertEqual(
			_document_party(_Doc(customer="CUST-0001",
			                     customer_name="Port Said Exports")),
			"Port Said Exports",
			"The NAME comes first: a card reading 'CUST-0001' is one more "
			"reference for a person to look up.",
		)

	def test_a_purchase_document_answers_with_the_supplier(self):
		self.assertEqual(
			_document_party(_Doc(supplier_name="Razyyn Acceptance Cables LLC")),
			"Razyyn Acceptance Cables LLC",
		)

	def test_a_code_is_better_than_nothing(self):
		"""A site that stores the link and no cached name still says something."""
		self.assertEqual(_document_party(_Doc(customer="CUST-0001")), "CUST-0001")

	def test_a_generic_party_document_answers_too(self):
		"""A Payment Entry names its counterparty `party`/`party_name`."""
		self.assertEqual(
			_document_party(_Doc(party="SUPP-0007", party_name="MA Inc.")),
			"MA Inc.",
		)

	def test_a_document_with_no_counterparty_answers_nothing(self):
		"""An Item and a Company have no party. Inventing one is the bug."""
		self.assertEqual(_document_party(_Doc(item_name="Steel Plate 5mm")), "")
		self.assertEqual(_document_party(_Doc()), "")

	def test_an_empty_field_is_not_an_answer(self):
		"""A blank column must fall through to the next name, not stop there."""
		self.assertEqual(
			_document_party(_Doc(customer_name="", customer=None,
			                     supplier_name="MA Inc.")),
			"MA Inc.",
		)

	def test_the_two_routes_walk_the_same_ladder(self):
		"""`search_documents` and `get_document_state` must not disagree.

		One client reads both. Two answers about one document is how a person
		checks a card against a list and concludes the agent found a different
		record than it did.
		"""
		from accountant_agent.agent_api.services.agent_write_service import _row_party

		for row in (
			{"customer_name": "Port Said Exports", "customer": "CUST-0001"},
			{"supplier_name": "MA Inc."},
			{"party_name": "Someone", "party": "P-1"},
			{"item_name": "Steel Plate 5mm"},
			{},
		):
			self.assertEqual(_row_party(dict(row)), _document_party(_Doc(row)),
			                 f"the two routes disagree about {row!r}")


if __name__ == "__main__":
	unittest.main()
