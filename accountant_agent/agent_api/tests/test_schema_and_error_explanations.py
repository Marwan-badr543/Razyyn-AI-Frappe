# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""What this endpoint tells the agent when a query cannot run, and where a
DocType's rows actually live.

Three errors arrived from production in one day, and all three were the agent
believing something this file had told it:

  * `(1064, "... near 'lines, SUM(debit) ...'")` — a reserved word used as an
    alias. The driver names the token and never says why it is refused, so the
    same alias was rewritten again and again.
  * `(1146, "Table '...tabGlobal Defaults' doesn't exist")` — a Single has no
    table of its own, and `build_doctype_schema_summary` had published
    `tab<DocType>` for every DocType including the Singles.
  * `(1054, "Unknown column 'posting_date'")` — the date is on the parent
    document, not on its rows; the schema reply never mentioned that the rows
    were a separate table at all.

These assert the reply carries the correction, not just the symptom.
"""

from frappe.tests.utils import FrappeTestCase

from accountant_agent.agent_api.services.agent_api_service import (
	_AGENT_ERROR_BUDGET_CHARS,
	_explain_execution_error,
	build_doctype_schema_summary,
)


class DriverError(Exception):
	"""Shaped like pymysql's: (errno, message)."""


class TestQueryErrorsExplainThemselves(FrappeTestCase):
	def test_a_syntax_error_names_the_token_it_stopped_at(self):
		detail = _explain_execution_error(
			DriverError(
				1064,
				"You have an error in your SQL syntax; check the manual that "
				"corresponds to your MariaDB server version for the right syntax "
				"to use near 'lines, SUM(debit) AS total_dr' at line 1",
			)
		)
		self.assertIn("'lines'", detail)
		self.assertIn("reserve", detail.lower())
		# The driver's own sentence is still there for whoever reads the log.
		self.assertIn("SQL syntax", detail)

	def test_a_missing_single_table_says_where_the_values_are(self):
		detail = _explain_execution_error(
			DriverError(1146, "Table '_abc.tabGlobal Defaults' doesn't exist")
		)
		self.assertIn("Single", detail)
		self.assertIn("tabSingles", detail)
		self.assertIn("Global Defaults", detail)

	def test_a_table_for_a_doctype_that_does_not_exist_says_so(self):
		detail = _explain_execution_error(
			DriverError(1146, "Table '_abc.tabNot A Real Doctype' doesn't exist")
		)
		self.assertIn("no 'Not A Real Doctype'", detail)

	def test_a_missing_column_names_the_parent_child_split(self):
		detail = _explain_execution_error(
			DriverError(1054, "Unknown column 'posting_date' in 'SELECT'")
		)
		self.assertIn("'posting_date'", detail)
		self.assertIn("parent", detail)
		self.assertIn("get_schema", detail)

	def test_an_error_with_no_explanation_is_passed_through_unchanged(self):
		raw = "Lost connection to MySQL server during query"
		self.assertEqual(_explain_execution_error(DriverError(2013, raw)), f"(2013, '{raw}')")

	def test_an_explainer_that_cannot_run_returns_the_driver_sentence(self):
		"""This runs inside an `except` block that `execute_query` has no
		catch-all above. An explainer that raised would turn a handled error
		into an unhandled traceback and tell the agent nothing at all."""

		class Hostile(Exception):
			def __str__(self):
				return "(1146, \"Table '_x.tabThing' doesn't exist\")"

			@property
			def args(self):
				raise RuntimeError("this exception refuses to be inspected")

		self.assertIn("Table", _explain_execution_error(Hostile()))

	def test_the_correction_comes_first_and_fits_what_the_agent_will_read(self):
		"""The agent's HTTP client clips an upstream error body at 300
		characters. With the driver's sentence in front, the clip landed
		exactly on the correction and kept the boilerplate about consulting
		the manual."""
		for exc in (
			DriverError(
				1064,
				"You have an error in your SQL syntax; check the manual that "
				"corresponds to your MariaDB server version for the right syntax "
				"to use near 'lines, SUM(debit) AS total_dr' at line 1",
			),
			DriverError(1146, "Table '_abc.tabGlobal Defaults' doesn't exist"),
			DriverError(1146, "Table '_abc.tabNot A Real Doctype' doesn't exist"),
			DriverError(1054, "Unknown column 'posting_date' in 'SELECT'"),
		):
			explained = _explain_execution_error(exc)
			self.assertIn("Database said:", explained)
			correction = explained.split("Database said:")[0]
			self.assertLessEqual(
				len(correction), _AGENT_ERROR_BUDGET_CHARS,
				f"the correction is {len(correction)} characters and the agent "
				f"reads only {_AGENT_ERROR_BUDGET_CHARS}: {correction}",
			)


class TestSchemaSummarySaysWhereRowsLive(FrappeTestCase):
	def test_a_single_is_not_given_a_table_that_does_not_exist(self):
		summary = build_doctype_schema_summary("Global Defaults")
		self.assertTrue(summary["is_single"])
		self.assertEqual(summary["table_name"], "tabSingles")
		self.assertNotIn("tabGlobal Defaults", summary["table_name"])
		self.assertIn("tabSingles", summary["how_to_read"])

	def test_an_ordinary_doctype_keeps_its_own_table(self):
		summary = build_doctype_schema_summary("Journal Entry")
		self.assertFalse(summary["is_single"])
		self.assertEqual(summary["table_name"], "tabJournal Entry")

	def test_a_parent_names_the_tables_its_rows_live_in(self):
		summary = build_doctype_schema_summary("Journal Entry")
		tables = {row["table_name"] for row in summary["child_tables"]}
		self.assertIn("tabJournal Entry Account", tables)
		self.assertIn("tabJournal Entry Account", summary["how_to_read"])

	def test_a_child_row_is_told_it_can_be_joined_back(self):
		summary = build_doctype_schema_summary("Journal Entry Account")
		self.assertTrue(summary["is_child_table"])
		joined = " ".join(summary["fields"])
		for column in ("parent ", "parenttype ", "parentfield ", "idx "):
			self.assertIn(column, joined)
		self.assertIn("PARENT", summary["how_to_read"])

	def test_a_table_field_is_never_listed_as_a_column_of_its_parent(self):
		"""`accounts` is a table field on Journal Entry; `tabJournal Entry` has
		no such column, so offering it among the columns would be a lie the
		agent then puts in a SELECT."""
		summary = build_doctype_schema_summary("Journal Entry")
		self.assertFalse(
			[f for f in summary["fields"] if f.startswith("accounts (")],
			"a table field was listed among the parent's own columns",
		)

	def test_child_tables_is_always_present_even_when_there_are_none(self):
		summary = build_doctype_schema_summary("Company")
		self.assertIn("child_tables", summary)
		self.assertIsInstance(summary["child_tables"], list)
