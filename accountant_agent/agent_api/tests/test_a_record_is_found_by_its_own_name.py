# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A record must be findable by the name its users actually call it.

WHAT HAPPENED

	A client asked the agent to put the laptop on an invoice instead of the
	phone. Their system holds that item under the code SKU002 and shows it as
	"Laptop". The agent searched, found nothing, and wrote SKU002's place in the
	invoice as the word "Laptop" — which is not a record, so the write was left
	pointing at an item that does not exist.

WHY

	The document search matched a fixed list of column names: the reference
	itself, a title, and the party columns a TRANSACTION happens to carry. Most
	records are not transactions. An item's own name is `item_name`, an
	account's is `account_name`, a cost centre's is `cost_center_name`, and a
	customer's site may hold kinds of record nobody here has heard of. Every one
	of those was findable only by the reference the system generated for it, so
	a person who used their own word for it was told, with total confidence,
	that they had no such record.

WHY ASKING THE DOCUMENT TYPE IS THE FIX

	Every system already records the answer, because its own users need it: the
	column it shows as a record's title, and the columns its administrator
	marked as the ones to search by. Reading those makes a kind of record this
	app has never heard of searchable by the name its users use, and it is the
	only version of this list that cannot go stale.

No site is needed: the function under test reads a document type's published
definition and nothing else.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_record_is_found_by_its_own_name
"""

import unittest

from accountant_agent.agent_api.services.agent_write_service import (
	_fields_a_person_might_name,
)


class _Field:
	def __init__(self, fieldname, fieldtype="Data"):
		self.fieldname = fieldname
		self.fieldtype = fieldtype


class _Meta:
	"""A document type as its own system publishes it."""

	def __init__(self, fields, title_field="", search_fields=""):
		self.fields = fields
		self.title_field = title_field
		self.search_fields = search_fields


class ARecordIsFoundByItsOwnName(unittest.TestCase):
	def test_an_items_own_name_is_searched(self):
		"""The live failure. `item_name` is in no fixed list and is exactly the
		word the client used."""
		meta = _Meta(
			[_Field("item_name"), _Field("item_group", "Link"),
			 _Field("description", "Text Editor")],
			title_field="item_name",
			search_fields="item_name,description,item_group",
		)

		searched = _fields_a_person_might_name(meta)

		self.assertIn("item_name", searched)
		self.assertIn("item_group", searched)

	def test_the_reference_is_always_searched_and_always_first(self):
		"""Somebody who types a document number must find that document, on a
		document type that declares nothing at all."""
		searched = _fields_a_person_might_name(_Meta([]))

		self.assertEqual(searched[0], "name")

	def test_prose_is_never_searched(self):
		"""A description may legitimately be listed as searchable. Matching a
		person's words against a paragraph turns a narrow search into every
		record anybody ever wrote a note on."""
		meta = _Meta(
			[_Field("item_name"), _Field("description", "Text Editor"),
			 _Field("remarks", "Small Text")],
			search_fields="description,remarks,item_name",
		)

		searched = _fields_a_person_might_name(meta)

		self.assertNotIn("description", searched)
		self.assertNotIn("remarks", searched)
		self.assertIn("item_name", searched)

	def test_a_column_the_document_type_does_not_have_is_never_asked_for(self):
		"""Asking for a column that does not exist is a SQL error, not an empty
		result — so a generic list is intersected with the real definition."""
		meta = _Meta([_Field("item_name")], search_fields="item_name,not_a_column")

		searched = _fields_a_person_might_name(meta)

		self.assertNotIn("not_a_column", searched)
		self.assertNotIn("customer_name", searched)

	def test_a_transaction_still_finds_its_party(self):
		"""The generic list is the floor, not the answer — it must stay."""
		meta = _Meta(
			[_Field("customer", "Link"), _Field("customer_name"), _Field("title")],
			title_field="title",
		)

		searched = _fields_a_person_might_name(meta)

		self.assertIn("customer_name", searched)
		self.assertIn("title", searched)

	def test_no_column_is_searched_twice(self):
		"""The title, the declared list and the generic list overlap. A repeated
		column is a repeated OR clause in every query."""
		meta = _Meta(
			[_Field("customer_name"), _Field("title")],
			title_field="title",
			search_fields="title,customer_name",
		)

		searched = _fields_a_person_might_name(meta)

		self.assertEqual(len(searched), len(set(searched)))
