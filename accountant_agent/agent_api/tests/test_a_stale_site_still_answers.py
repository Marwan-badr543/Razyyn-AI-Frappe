# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A field this site has not migrated must not take down the whole route.

WHAT HAPPENED

	`messaging_config` - the route the agent calls before it can send anything
	- answered HTTP 500 on a live bench:

		{'error': 'The messaging settings could not be read.'}

	The site held the app's code and an older database. Its copy of
	Agent Messaging Settings had `telegram_destinations` and
	`slack_destinations` but not `email_destinations`, so reading that one
	attribute raised AttributeError and the customer was told nothing about
	the two channels the site could still have used.

WHY IT IS THE PATTERN AND NOT THE FIELD

	"Has this site been migrated?" was being answered independently at each
	call site - some reads guarded, some not. One unguarded read is enough to
	lose the route. It is answered once now, in `_settings()`: every field the
	app ships and the site lacks is filled with what stands for "not set" for
	its type, the gap is named once per process in the site's Error Log, and a
	channel that genuinely depends on a missing field says so in its own
	`unavailable_reason` instead of failing.

No site is needed: the document and its meta are doubled.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_stale_site_still_answers
"""

import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_messaging_service as service


#: What the app ships, as `_shipped_fields()` reads it off the DocType json.
SHIPPED = [
	("gmail_enabled", "Check"),
	("gmail_sender_email", "Data"),
	("gmail_smtp_host", "Data"),
	("email_destinations", "Table"),
	("telegram_enabled", "Check"),
	("telegram_destinations", "Table"),
	("slack_enabled", "Check"),
	("slack_destinations", "Table"),
]


class _StaleSettings:
	"""The Single as a site that never migrated `email_destinations` holds it.

	Everything the app ships is here except that one field, and reading it
	raises exactly what a real Document raises.
	"""

	def __init__(self):
		self.gmail_enabled = 1
		self.gmail_sender_email = "reports@example.com"
		self.gmail_smtp_host = "smtp.example.com"
		self.telegram_enabled = 0
		self.telegram_destinations = []
		self.slack_enabled = 0
		self.slack_destinations = []

	def get_password(self, *_args, **_kwargs):
		return "an-app-password"


class _Meta:
	def __init__(self, present):
		self._present = set(present)

	def get_field(self, fieldname):
		return object() if fieldname in self._present else None


class AStaleSiteStillAnswers(unittest.TestCase):
	def setUp(self):
		service._SHIPPED_FIELDS = list(SHIPPED)
		service._STALE_SCHEMA_REPORTED.clear()
		self.settings = _StaleSettings()
		self.meta = _Meta(name for name, _ in SHIPPED if name != "email_destinations")
		patches = [
			mock.patch.object(service.frappe, "get_single", return_value=self.settings),
			mock.patch.object(service.frappe, "get_meta", return_value=self.meta),
			mock.patch.object(service.frappe, "log_error"),
		]
		started = []
		for patch in patches:
			started.append(patch.start())
			self.addCleanup(patch.stop)
		self.log_error = started[-1]

	def tearDown(self):
		service._SHIPPED_FIELDS = None
		service._STALE_SCHEMA_REPORTED.clear()

	def test_the_route_answers_for_every_channel(self):
		config = service.get_messaging_config()

		self.assertEqual(
			sorted(config["channels"]), ["gmail", "slack", "telegram"],
			"a field the site lacks must cost that field, not the whole reply",
		)

	def test_the_channel_that_can_still_send_still_says_so(self):
		config = service.get_messaging_config()

		gmail = config["channels"]["gmail"]
		self.assertTrue(gmail["enabled"], "email needs no address book to be usable")
		self.assertEqual(gmail["destinations"], [], "an absent table holds no rows")

	def test_a_channel_that_needs_the_missing_field_names_the_migration(self):
		self.meta = _Meta(name for name, _ in SHIPPED if name != "telegram_destinations")
		service.frappe.get_meta.return_value = self.meta
		self.settings.telegram_enabled = 1
		self.settings.email_destinations = []   # this site DID migrate that one
		del self.settings.telegram_destinations

		telegram = service.get_messaging_config()["channels"]["telegram"]

		self.assertFalse(telegram["enabled"])
		self.assertEqual(telegram["unavailable_reason"], service.STALE_SCHEMA_REASON)

	def test_the_gap_is_named_in_the_error_log_once_per_process(self):
		service.get_messaging_config()
		service.get_messaging_config()

		self.assertEqual(
			self.log_error.call_count, 1,
			"a stale site names its gap once, not once per turn",
		)
		self.assertIn("email_destinations", self.log_error.call_args.kwargs["message"])

	def test_a_migrated_site_reports_nothing_and_reads_normally(self):
		service.frappe.get_meta.return_value = _Meta(name for name, _ in SHIPPED)
		self.settings.email_destinations = []

		config = service.get_messaging_config()

		self.assertTrue(config["channels"]["gmail"]["enabled"])
		self.log_error.assert_not_called()


if __name__ == "__main__":
	unittest.main()
