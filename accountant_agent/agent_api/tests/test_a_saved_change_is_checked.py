# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A save that succeeded is not proof the change happened.

WHAT HAPPENED

	A client asked for the payment due date to be moved on nine draft invoices.
	Nine writes committed, nine write-log rows said COMMITTED, and the client
	was told all nine had been changed. Not one due date had moved.

WHY

	`save()` runs the document type's own `validate()`, and validate's job is to
	make the document consistent with itself — so a field the document DERIVES
	from another is recomputed on the way through, over whatever the caller set.
	This document type works its due date out from its payment schedule. There
	was no exception, no refusal and no error message: from every angle except
	the document itself, the write looked exactly like a success.

WHAT IS CHECKED, AND WHY IT REPORTS RATHER THAN REFUSES

	The saved document is compared with what was asked for, inside the same
	transaction. Rolling the write back would discard the values that DID take,
	and refusing a write the system merely tidied would raise a false alarm on
	every derived column — so the write stands and the caller is told exactly
	which values the document does not carry. The agent then reports that work
	as not done, which is the only honest answer.

No site is needed for the comparison itself; the meta-driven part is stubbed.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_saved_change_is_checked
"""

import datetime
import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_write_service
from accountant_agent.agent_api.services.agent_write_service import (
	_the_same_value,
	_values_the_document_did_not_take,
)


class _Meta:
	def __init__(self, fieldnames):
		self._fieldnames = set(fieldnames)

	def has_field(self, fieldname):
		return fieldname in self._fieldnames

	def get_label(self, fieldname):
		return fieldname.replace("_", " ").title()


class _Doc:
	def __init__(self, doctype="Sales Invoice", **values):
		self.doctype = doctype
		self.name = "ACC-SINV-2026-00079"
		self._values = values

	def get(self, fieldname, default=None):
		return self._values.get(fieldname, default)


def _not_taken(doc, asked_for, fieldnames):
	with mock.patch.object(
		agent_write_service, "get_doctype_meta", return_value=_Meta(fieldnames)
	):
		return _values_the_document_did_not_take(doc, asked_for)


class ASavedChangeIsChecked(unittest.TestCase):
	def test_a_due_date_the_document_recomputed_is_reported(self):
		"""The live failure, in one assertion."""
		doc = _Doc(due_date=datetime.date(2026, 9, 16))

		not_taken = _not_taken(doc, {"due_date": "2026-12-31"}, ["due_date"])

		self.assertEqual([entry["field"] for entry in not_taken], ["due_date"])
		self.assertEqual(not_taken[0]["asked"], "2026-12-31")
		self.assertEqual(not_taken[0]["holds"], "2026-09-16")

	def test_a_value_the_document_did_take_is_not_reported(self):
		doc = _Doc(due_date=datetime.date(2026, 12, 31))

		self.assertEqual(
			_not_taken(doc, {"due_date": "2026-12-31"}, ["due_date"]), []
		)

	def test_row_tables_are_never_compared(self):
		"""A row table is replaced wholesale and re-numbered and re-priced by the
		document type as a matter of course. Comparing rows would raise a
		difference on nearly every correct change."""
		doc = _Doc(items=[{"item_code": "SKU002", "idx": 1, "amount": 0}])

		not_taken = _not_taken(
			doc, {"items": [{"item_code": "SKU002"}]}, ["items"]
		)

		self.assertEqual(not_taken, [])

	def test_a_column_this_document_type_does_not_have_is_not_compared(self):
		"""The caller's own framework columns are already stripped before this
		runs; anything else unknown is the shape check's business, not this."""
		doc = _Doc(due_date=datetime.date(2026, 12, 31))

		not_taken = _not_taken(
			doc, {"due_date": "2026-12-31", "not_a_column": "x"}, ["due_date"]
		)

		self.assertEqual(not_taken, [])


class TheSameValue(unittest.TestCase):
	"""What counts as the document carrying what was asked for.

	Every case here is a FALSE ALARM that would otherwise be reported to a
	client as work that did not happen.
	"""

	def test_a_date_column_answers_as_a_date(self):
		self.assertTrue(_the_same_value("2026-12-31", datetime.date(2026, 12, 31)))

	def test_a_datetime_column_adds_a_time_nobody_wrote(self):
		self.assertTrue(_the_same_value("2026-12-31", "2026-12-31 00:00:00"))

	def test_a_different_date_is_a_difference(self):
		self.assertFalse(_the_same_value("2026-12-31", datetime.date(2026, 9, 16)))

	def test_a_figure_rounded_to_the_currency_is_the_same_figure(self):
		self.assertTrue(_the_same_value("1234.5678", "1234.57"))

	def test_a_figure_that_genuinely_differs_is_a_difference(self):
		self.assertFalse(_the_same_value("1000", "900"))

	def test_a_number_written_as_a_string_matches_the_number(self):
		self.assertTrue(_the_same_value("100.0", 100))

	def test_a_checkbox_matches_however_it_is_written(self):
		self.assertTrue(_the_same_value(1, True))
		self.assertFalse(_the_same_value(1, False))

	def test_a_link_written_in_the_clients_casing_is_the_same_record(self):
		"""The false alarm this cost: "marwan" is resolved to the customer this
		system files under "Marwan" and stored under the record's own name. The
		change worked, and was reported as a change that did not happen."""
		self.assertTrue(_the_same_value("marwan", "Marwan"))

	def test_a_different_record_is_still_a_difference(self):
		self.assertFalse(_the_same_value("Marwan", "Grant Plastics Ltd."))

	def test_a_name_never_matches_on_a_prefix(self):
		"""Only calendar dates match partly. "Grant" is not "Grant Plastics
		Ltd." — a link field is exact or it is a different record."""
		self.assertFalse(_the_same_value("Grant", "Grant Plastics Ltd."))

	def test_asking_for_nothing_is_satisfied_by_nothing(self):
		self.assertTrue(_the_same_value("", None))
		self.assertTrue(_the_same_value(None, ""))

	def test_asking_for_nothing_is_not_satisfied_by_something(self):
		self.assertFalse(_the_same_value("", "Grant Plastics Ltd."))
