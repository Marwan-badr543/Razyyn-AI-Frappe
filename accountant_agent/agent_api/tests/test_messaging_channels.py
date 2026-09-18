# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""The three ways a message leaves this site, and the promises each one keeps.

WHAT CHANGED, AND WHY THESE EXIST NOW

    Email used to go through the Gmail API with a Google Cloud service account
    and domain-wide delegation. Only a Workspace ADMINISTRATOR can authorise
    that, so a two-person practice on a free @gmail.com address — or on
    Outlook, or on their own mail server — could not email a client at all.
    Email now leaves over plain SMTP from whatever mailbox the practice
    configured, which is the one thing every one of them already has.

    That swap moves the receipt onto thin ice, and the first case below is
    about exactly that. The Gmail API answered with a message id; `sendmail`
    answers with nothing whatsoever, and "no exception was raised" has never
    been evidence that a message was delivered. So the id is written into the
    header before the message leaves.

    Slack had never been exercised at all.

No site is needed: every function under test is pure, or reaches the outside
world through one seam that is patched here.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

    cd ~/frappe/frappe-bench-v14 && ./env/bin/python -m unittest \\
        accountant_agent.agent_api.tests.test_messaging_channels

`frappe._()` opens `logs/frappe.log` relative to the current directory, so from
anywhere else these error out on a missing log file rather than on anything
they were written to check.
"""

import smtplib
import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_messaging_service as svc


class FakeSettings:
	"""A configured mailbox, a bot token, and nothing that reaches a network."""

	def __init__(self, **overrides):
		self.gmail_enabled = 1
		self.gmail_sender_email = "reports@example.com"
		self.gmail_sender_name = "Example Accounts"
		self.gmail_smtp_host = "smtp.gmail.com"
		self.gmail_smtp_port = 0
		self.gmail_smtp_security = "STARTTLS"
		self.gmail_smtp_username = ""
		self.gmail_smtp_password = "abcd efgh ijkl mnop"
		self.slack_enabled = 1
		self.slack_bot_token = "xoxb-not-a-real-token"
		self.email_destinations = []
		self.telegram_destinations = []
		self.slack_destinations = []
		self.__dict__.update(overrides)

	def get_password(self, field, raise_exception=False):
		return getattr(self, field, None)

	def get(self, field, default=None):
		return getattr(self, field, default)


class FakeRow:
	"""One child row of the settings document."""

	def __init__(self, **values):
		self.label = ""
		self.email_address = ""
		self.chat_id = ""
		self.channel_id = ""
		self.is_default = 0
		self.notes = ""
		self.__dict__.update(values)


class FakeSmtp:
	"""Everything smtplib.SMTP does that this code depends on, and no socket."""

	def __init__(self, refused=None, login_error=None):
		self.refused = refused or {}
		self.login_error = login_error
		self.started_tls = False
		self.logged_in_as = None
		self.sent = []

	def __enter__(self):
		return self

	def __exit__(self, *_exc):
		return False

	def ehlo(self):
		pass

	def starttls(self, context=None):
		self.started_tls = True

	def login(self, username, password):
		if self.login_error:
			raise self.login_error
		self.logged_in_as = (username, password)

	def send_message(self, message):
		self.sent.append(message)
		return dict(self.refused)


# ── email, over the practice's own mailbox ───────────────────────────────


class TestEmailOverSmtp(unittest.TestCase):
	def setUp(self):
		self.settings = FakeSettings()

	def _send(self, server, **kwargs):
		with mock.patch.object(svc.smtplib, "SMTP", return_value=server):
			return svc._send_gmail(
				self.settings,
				kwargs.get("to", "client@example.com"),
				kwargs.get("subject", "March VAT"),
				kwargs.get("body", "Attached."),
				kwargs.get("attachments", []),
			)

	def test_the_receipt_is_the_id_the_message_actually_carries(self):
		"""SMTP returns NOTHING on success, so the id has to be ours.

		Letting the receiving server invent the Message-ID would leave this
		side with no reference to put on the receipt — and the agent is
		forbidden to claim a send it cannot name. Writing it into the header
		means the reference the customer is given is the one in the
		recipient's own copy of the email, so the message can be found.
		"""
		server = FakeSmtp()
		message_id = self._send(server)

		self.assertTrue(message_id.startswith("<"))
		self.assertEqual(len(server.sent), 1)
		self.assertEqual(server.sent[0]["Message-ID"], message_id)
		# Stamped with the sender's own domain, which is what a spam filter
		# expects and what an administrator can find in their server's log.
		self.assertIn("@example.com>", message_id)

	def test_the_message_is_addressed_and_signed_the_way_it_was_asked_to_be(self):
		server = FakeSmtp()
		self._send(server, to="auditor@client.test", subject="Trial balance")

		sent = server.sent[0]
		self.assertEqual(sent["To"], "auditor@client.test")
		self.assertEqual(sent["Subject"], "Trial balance")
		self.assertIn("reports@example.com", sent["From"])
		self.assertIn("Example Accounts", sent["From"])

	def test_a_file_travels_as_a_real_attachment(self):
		server = FakeSmtp()
		self._send(server, attachments=[{
			"filename": "march-vat.pdf",
			"content": b"not really a pdf",
			"mimetype": "application/pdf",
		}])

		names = [part.get_filename() for part in server.sent[0].iter_attachments()]
		self.assertEqual(names, ["march-vat.pdf"])

	def test_the_connection_is_encrypted_and_signed_in_to(self):
		server = FakeSmtp()
		self._send(server)

		self.assertTrue(server.started_tls)
		# The username was left empty, which must mean the Send As address
		# rather than an empty login every mail server would refuse.
		self.assertEqual(server.logged_in_as[0], "reports@example.com")

	def test_ssl_uses_its_own_port_and_does_not_start_tls_twice(self):
		"""465 speaks TLS from the first byte; STARTTLS on top of it hangs."""
		self.settings.gmail_smtp_security = "SSL"
		server = FakeSmtp()
		with mock.patch.object(svc.smtplib, "SMTP_SSL", return_value=server) as ssl_server:
			svc._send_gmail(self.settings, "client@example.com", "s", "b", [])

		self.assertEqual(ssl_server.call_args.args[1], 465)
		self.assertFalse(server.started_tls)

	def test_a_refused_recipient_is_a_failure_and_not_a_quiet_success(self):
		"""`send_message` RETURNS the addresses it would not take.

		It raises nothing when some were accepted and some were not, so a
		message that reached nobody comes back looking exactly like one that
		reached everybody. Reporting that as sent is the whole mistake the
		receipt rule exists to prevent.
		"""
		server = FakeSmtp(refused={"client@example.com": (550, b"No such user")})

		with self.assertRaises(svc.ProviderRefusedError) as caught:
			self._send(server)

		self.assertEqual(caught.exception.code, "SMTP_RECIPIENT_REFUSED")
		self.assertIn("client@example.com", caught.exception.detail)

	def test_a_refused_sign_in_names_the_app_password(self):
		"""The one failure every Gmail customer hits.

		Google refuses an account password outright and says only "Username
		and Password not accepted", which reads as a typo and sends them back
		to retype the very password that can never work.
		"""
		server = FakeSmtp(login_error=smtplib.SMTPAuthenticationError(
			535, b"5.7.8 Username and Password not accepted",
		))

		with self.assertRaises(svc.ProviderRefusedError) as caught:
			self._send(server)

		self.assertEqual(caught.exception.code, "SMTP_AUTH_REFUSED")
		self.assertIn("App Password", caught.exception.detail)
		# The server's own words, decoded — not b'5.7.8 …' quoted at an
		# accountant as a Python repr.
		self.assertIn("Username and Password not accepted", caught.exception.detail)
		self.assertNotIn("b'", caught.exception.detail)

	def test_a_mail_server_that_cannot_be_reached_says_so(self):
		with mock.patch.object(svc.smtplib, "SMTP", side_effect=OSError("no route to host")):
			with self.assertRaises(svc.ProviderRefusedError) as caught:
				svc._send_gmail(self.settings, "client@example.com", "s", "b", [])

		self.assertEqual(caught.exception.code, "SMTP_UNREACHABLE")
		self.assertIn("smtp.gmail.com", caught.exception.detail)

	def test_the_port_follows_the_security_setting_when_none_is_given(self):
		self.assertEqual(svc._smtp_settings(FakeSettings())[1], 587)
		self.assertEqual(
			svc._smtp_settings(FakeSettings(gmail_smtp_security="SSL"))[1], 465,
		)
		# And a port the administrator DID name is never overridden.
		self.assertEqual(
			svc._smtp_settings(FakeSettings(gmail_smtp_port=2525))[1], 2525,
		)

	def test_a_half_configured_mailbox_is_refused_before_any_connection(self):
		for missing in ("gmail_smtp_host", "gmail_smtp_password"):
			with self.subTest(missing=missing):
				with self.assertRaises(svc.ChannelNotConfiguredError):
					svc._smtp_settings(FakeSettings(**{missing: ""}))

	def test_the_gap_names_the_one_thing_to_go_and_do(self):
		""""Email is not configured" is true of every branch and useful in none.

		The administrator has to know whether to tick a box, type an address,
		or go and make an App Password.
		"""
		self.assertIn("switched off", svc._gmail_gap(FakeSettings(gmail_enabled=0)))
		self.assertIn("mailbox", svc._gmail_gap(FakeSettings(gmail_sender_email="")))
		self.assertIn("smtp.gmail.com", svc._gmail_gap(FakeSettings(gmail_smtp_host="")))
		self.assertIn("App Password", svc._gmail_gap(FakeSettings(gmail_smtp_password="")))


# ── Slack ────────────────────────────────────────────────────────────────


class FakeResponse:
	def __init__(self, payload, status_code=200):
		self._payload = payload
		self.status_code = status_code
		self.text = str(payload)

	def json(self):
		return self._payload


class TestSlack(unittest.TestCase):
	def setUp(self):
		self.settings = FakeSettings()

	def test_a_message_with_no_file_is_one_post_and_names_its_id(self):
		posted = []

		def fake_post(url, **kwargs):
			posted.append((url, kwargs))
			return FakeResponse({"ok": True, "ts": "1726400000.000100"})

		with mock.patch.object(svc.requests, "post", side_effect=fake_post):
			message_id = svc._send_slack(self.settings, "C123", "Done.", [])

		self.assertEqual(message_id, "1726400000.000100")
		self.assertEqual(len(posted), 1)
		self.assertIn("chat.postMessage", posted[0][0])
		self.assertEqual(posted[0][1]["json"]["channel"], "C123")
		self.assertEqual(
			posted[0][1]["headers"]["Authorization"], "Bearer xoxb-not-a-real-token",
		)

	def test_a_file_goes_through_the_three_step_upload_with_the_note_on_it(self):
		"""Slack's external-upload flow: ask, put, complete.

		The body rides as the first file's comment so a one-file message
		arrives as one notification rather than two — the same shape Telegram
		is given.
		"""
		calls = []

		def fake_post(url, **kwargs):
			calls.append((url, kwargs))
			if "getUploadURLExternal" in url:
				return FakeResponse({
					"ok": True, "upload_url": "https://files.slack.test/upload",
					"file_id": "F999",
				})
			if "files.slack.test" in url:
				return FakeResponse({}, status_code=200)
			return FakeResponse({"ok": True})

		with mock.patch.object(svc.requests, "post", side_effect=fake_post):
			message_id = svc._send_slack(self.settings, "C123", "Here it is.", [{
				"filename": "march-vat.pdf",
				"content": b"not really a pdf",
				"mimetype": "application/pdf",
			}])

		self.assertEqual(message_id, "F999")
		urls = [url for url, _ in calls]
		self.assertIn("getUploadURLExternal", urls[0])
		self.assertEqual(urls[1], "https://files.slack.test/upload")
		self.assertIn("completeUploadExternal", urls[2])

		# The ticket endpoint takes FORM fields. Sent as JSON it answers
		# `invalid_arguments` with no hint that the encoding was the problem.
		self.assertIn("data", calls[0][1])
		self.assertEqual(calls[0][1]["data"]["filename"], "march-vat.pdf")
		self.assertEqual(calls[0][1]["data"]["length"], len(b"not really a pdf"))

		complete = calls[2][1]["json"]
		self.assertEqual(complete["channel_id"], "C123")
		self.assertEqual(complete["initial_comment"], "Here it is.")
		self.assertEqual(complete["files"], [{"id": "F999", "title": "march-vat.pdf"}])

	def test_a_bot_that_was_never_invited_is_told_to_be_invited(self):
		with mock.patch.object(svc.requests, "post",
		                       return_value=FakeResponse({"ok": False, "error": "not_in_channel"})):
			with self.assertRaises(svc.ProviderRefusedError) as caught:
				svc._send_slack(self.settings, "C123", "Done.", [])

		self.assertEqual(caught.exception.code, "SLACK_NOT_IN_CHANNEL")
		self.assertIn("/invite", caught.exception.detail)

	def test_a_token_without_the_file_permission_names_the_reinstall(self):
		"""A scope added without reinstalling the app does not take effect.

		That is the whole of this failure, and Slack's own word for it is
		"missing_scope" — which sends an administrator to add the scope they
		have already added.
		"""
		with mock.patch.object(svc.requests, "post", return_value=FakeResponse({
			"ok": False, "error": "missing_scope", "needed": "files:write",
		})):
			with self.assertRaises(svc.ProviderRefusedError) as caught:
				svc._send_slack(self.settings, "C123", "Done.", [{
					"filename": "x.pdf", "content": b"x", "mimetype": "application/pdf",
				}])

		self.assertEqual(caught.exception.code, "SLACK_MISSING_SCOPE")
		self.assertIn("files:write", caught.exception.detail)
		self.assertIn("REINSTALL", caught.exception.detail)

	def test_an_accepted_post_with_no_id_is_not_a_send(self):
		"""Absence of an error is not evidence of delivery."""
		with mock.patch.object(svc.requests, "post",
		                       return_value=FakeResponse({"ok": True})):
			with self.assertRaises(svc.ProviderRefusedError) as caught:
				svc._send_slack(self.settings, "C123", "Done.", [])

		self.assertEqual(caught.exception.code, "SLACK_NO_RECEIPT")

	def test_a_provider_error_body_is_never_repeated_whole(self):
		"""An error body can carry the request back — attachment included."""
		detail = svc._short_provider_error(FakeResponse({
			"error": "x" * 2000,
		}, status_code=500))
		self.assertLessEqual(len(detail), 300)


# ── what the agent is told it can do ─────────────────────────────────────


class TestSubjectLine(unittest.TestCase):
	def test_a_subject_becomes_the_first_line_where_there_is_no_subject_field(self):
		"""Telegram and Slack have none. Dropping it loses the one line that
		names what an attached file actually is."""
		self.assertEqual(svc._body_with_subject("March VAT", "Attached."),
		                 "March VAT\n\nAttached.")
		self.assertEqual(svc._body_with_subject("", "Attached."), "Attached.")
		self.assertEqual(svc._body_with_subject("March VAT", ""), "March VAT")


if __name__ == "__main__":
	unittest.main()


# ── the email address book ───────────────────────────────────────────────
#
# Saving who you email so that nobody types the address twice. This list is
# NOT the permitted set it is on Telegram and Slack: email reaches anybody, so
# an address given in full must go on working exactly as it did.


class TestTheEmailAddressBook(unittest.TestCase):
	def setUp(self):
		self.settings = FakeSettings(email_destinations=[
			FakeRow(label="Marwan", email_address="marwan@example.com", is_default=1),
			FakeRow(label="The auditors", email_address="audit@example.com"),
		])

	def _resolve(self, destination):
		return svc._resolve_gmail_destination(self.settings, destination)

	def test_a_name_becomes_the_address_saved_under_it(self):
		self.assertEqual(self._resolve("Marwan"), ("marwan@example.com", "Marwan"))

	def test_the_name_is_read_however_it_was_typed(self):
		self.assertEqual(
			self._resolve("  the AUDITORS "), ("audit@example.com", "The auditors"),
		)

	def test_an_address_given_in_full_still_goes_exactly_there(self):
		"""The address book must not become a fence."""
		self.assertEqual(
			self._resolve("someone-new@example.com"), ("someone-new@example.com", ""),
		)

	def test_a_saved_address_is_named_by_its_saved_name(self):
		"""So the receipt says "Sent to Marwan", which is what was asked for."""
		self.assertEqual(
			self._resolve("marwan@example.com"), ("marwan@example.com", "Marwan"),
		)

	def test_naming_nobody_uses_the_default_recipient(self):
		self.assertEqual(self._resolve(""), ("marwan@example.com", "Marwan"))

	def test_one_saved_recipient_and_no_default_is_still_unambiguous(self):
		self.settings.email_destinations = [
			FakeRow(label="Marwan", email_address="marwan@example.com"),
		]
		self.assertEqual(self._resolve(None), ("marwan@example.com", "Marwan"))

	def test_a_name_nobody_saved_is_refused_and_says_what_is_saved(self):
		"""And says the way out: the address itself always works."""
		with self.assertRaises(svc.UnknownDestinationError) as raised:
			self._resolve("the tax office")
		detail = raised.exception.detail
		self.assertIn("Marwan", detail)
		self.assertIn("The auditors", detail)
		self.assertIn("address", detail)

	def test_a_half_filled_row_is_not_offered(self):
		"""A name with no address behind it would turn a configuration slip
		into a delivery failure the accountant sees."""
		self.settings.email_destinations = [
			FakeRow(label="Half", email_address=""),
			FakeRow(label="Marwan", email_address="marwan@example.com"),
		]
		with self.assertRaises(svc.UnknownDestinationError):
			self._resolve("Half")
		self.assertEqual(self._resolve("Marwan"), ("marwan@example.com", "Marwan"))

	def test_with_nobody_saved_an_address_is_still_required(self):
		"""Email with an empty address book works; email with no recipient at
		all is a message with nowhere to go."""
		self.settings.email_destinations = []
		self.assertEqual(
			self._resolve("client@example.com"), ("client@example.com", ""),
		)
		with self.assertRaises(svc.UnknownDestinationError):
			self._resolve("")
		with self.assertRaises(svc.UnknownDestinationError):
			self._resolve("the auditors")


# ── one default per channel ──────────────────────────────────────────────


class TestOnlyOneDefaultSurvives(unittest.TestCase):
	"""Two defaults is not a form error anybody notices. It is a report emailed
	to the wrong person months later, because the send path takes the first
	default it finds and nothing said which one was meant."""

	def _settled(self, **tables):
		from accountant_agent.accountant_agent.doctype.agent_messaging_settings \
			.agent_messaging_settings import AgentMessagingSettings

		class Doc:
			def __init__(self, values):
				self._values = values

			def get(self, name, default=None):
				return self._values.get(name, default)

		doc = Doc(tables)
		AgentMessagingSettings._settle_the_defaults(doc)
		return tables

	def test_the_newest_choice_wins(self):
		"""Ticking a new default is how somebody says "this one now"; leaving
		the older tick in place would make that say nothing at all."""
		rows = [
			FakeRow(label="Old", email_address="old@example.com", is_default=1),
			FakeRow(label="New", email_address="new@example.com", is_default=1),
		]
		self._settled(email_destinations=rows)
		self.assertEqual([r.is_default for r in rows], [0, 1])

	def test_two_ticked_at_once_leave_one_standing(self):
		"""Never none. A channel with no default at all makes the agent ask
		which to use, over a list where somebody had plainly chosen."""
		rows = [
			FakeRow(label="First", is_default=1),
			FakeRow(label="Second", is_default=1),
			FakeRow(label="Third", is_default=1),
		]
		self._settled(email_destinations=rows)
		self.assertEqual([r.is_default for r in rows], [0, 0, 1])

	def test_each_channel_settles_on_its_own(self):
		email = [FakeRow(label="A", is_default=1)]
		telegram = [FakeRow(label="B", is_default=1), FakeRow(label="C", is_default=1)]
		self._settled(email_destinations=email, telegram_destinations=telegram)
		self.assertEqual([r.is_default for r in email], [1])
		self.assertEqual([r.is_default for r in telegram], [0, 1])

	def test_no_default_at_all_is_left_alone(self):
		"""Nobody has to nominate one. Naming the destination every time is a
		perfectly ordinary way to work."""
		rows = [FakeRow(label="A"), FakeRow(label="B")]
		self._settled(slack_destinations=rows)
		self.assertEqual([r.is_default for r in rows], [0, 0])
