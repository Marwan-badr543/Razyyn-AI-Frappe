# Copyright (c) 2026, Marwan Badr and Contributors
# See license.txt

import base64
import json
import time
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.password import get_decrypted_password

from accountant_agent.accountant_agent.page.agent_chat.agent_chat import (
	PlatformUnreachable,
	REFUSED,
	RENEWED,
	UNREACHABLE,
	call_the_platform,
	end_agent_session,
	get_agent_access_token,
	save_agent_settings,
	token_verdict,
)


class TestAgentSettings(FrappeTestCase):
	"""The credential storage the whole sign-in flow rests on."""

	def setUp(self) -> None:
		self.email = "renewal-test@example.com"
		existing = frappe.db.get_value("Agent Settings", {"email": self.email}, "name")
		if existing:
			frappe.delete_doc("Agent Settings", existing, ignore_permissions=True, force=True)
		save_agent_settings(self.email, api_key="test-key-0001")

	def tearDown(self) -> None:
		name = frappe.db.get_value("Agent Settings", {"email": self.email}, "name")
		if name:
			frappe.delete_doc("Agent Settings", name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def _stored(self, fieldname: str):
		name = frappe.db.get_value("Agent Settings", {"email": self.email}, "name")
		return get_decrypted_password(
			"Agent Settings", name, fieldname, raise_exception=False
		)

	def test_a_refresh_token_can_actually_be_stored_and_read_back(self):
		"""The single fault behind "please sign in again" every fifteen minutes.

		`refresh_token` was declared in the app's DocType file but the field had
		never been applied to the site, and Frappe writes a Password field only
		if the site's own schema knows about it. Every write was silently
		discarded and every read came back empty, so a session could never be
		renewed — with no error raised anywhere to say why.

		A round trip is the only thing that proves the credential is really
		being kept. Asserting that the code sets the attribute would have passed
		throughout the outage.
		"""
		save_agent_settings(
			self.email, access_token="access-value", refresh_token="refresh-value",
		)

		self.assertEqual(self._stored("access_token"), "access-value")
		self.assertEqual(self._stored("refresh_token"), "refresh-value")

	def test_ending_a_session_removes_both_credentials(self):
		"""Clearing a field is not the same as removing a secret.

		Frappe skips empty Password fields when a document is saved, so the
		places that ended a dead session by writing an empty string left the old
		refresh token in place — still good for weeks against the platform.
		"""
		save_agent_settings(
			self.email, access_token="access-value", refresh_token="refresh-value",
		)

		end_agent_session(self.email)

		self.assertFalse(self._stored("access_token"))
		self.assertFalse(self._stored("refresh_token"))


	# ─── Renewal ────────────────────────────────────────────────────────────

	@staticmethod
	def _token_expiring_in(seconds: int, subject: str = "u") -> str:
		"""A token shaped like the platform's, with a chosen expiry."""
		def segment(raw: bytes) -> str:
			return base64.urlsafe_b64encode(raw).decode().rstrip("=")

		header = segment(b'{"alg":"HS256"}')
		claims = segment(json.dumps({"sub": subject, "exp": int(time.time()) + seconds}).encode())
		return f"{header}.{claims}.signature"

	def _platform_returns(self, calls: list):
		"""Stand in for the platform's renewal endpoint, recording what it was sent."""
		class Renewed:
			status_code = 200
			text = ""

			def json(inner):
				return {
					"access_token": self._token_expiring_in(900, subject="renewed"),
					"refresh_token": "rotated-refresh",
				}

		def post(url, **kwargs):
			calls.append(kwargs.get("json"))
			return Renewed()

		return post

	def test_a_token_about_to_expire_is_renewed_before_it_is_used(self):
		"""Waiting to be refused costs the customer a wasted round trip.

		It also turns one moment of expiry into a burst of simultaneous
		renewals from every part of the page at once — which is how a rotating
		refresh token gets presented twice and the platform, correctly, ends
		the session.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		calls = []
		with patch("requests.post", self._platform_returns(calls)):
			token = get_agent_access_token(self.email)

		self.assertTrue(token)
		self.assertEqual(calls, [{"refresh_token": "stored-refresh"}])

	def test_the_rotated_refresh_token_is_kept(self):
		"""The platform retires the old one the instant it issues a new one.

		Failing to store the replacement makes the NEXT renewal a replay of a
		spent credential, which the platform cannot tell from a stolen copy —
		so it ends the session and the customer is sent back to the sign-in
		screen for a reason nothing on this side would ever explain.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		with patch("requests.post", self._platform_returns([])):
			get_agent_access_token(self.email)

		self.assertEqual(self._stored("refresh_token"), "rotated-refresh")

	def test_a_live_token_is_reused_rather_than_renewed_again(self):
		"""Renewal happens once, however many parts of the site ask for a token.

		Every request handler and background worker on this site asks for the
		token independently. If each one renewed, they would each present a
		refresh token that the first of them had already spent.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		calls = []
		with patch("requests.post", self._platform_returns(calls)):
			first = get_agent_access_token(self.email)
			again = [get_agent_access_token(self.email) for _ in range(4)]

		self.assertEqual(len(calls), 1)
		self.assertEqual(set(again), {first})

	def test_a_network_failure_does_not_throw_the_session_away(self):
		"""An unreachable platform is not an ended session.

		Discarding the stored refresh token here would turn a moment of network
		trouble into a sign-in prompt for every customer on the site.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		def unreachable(url, **kwargs):
			raise Exception("connection refused")

		with patch("requests.post", unreachable):
			self.assertIsNone(get_agent_access_token(self.email))

		self.assertEqual(self._stored("refresh_token"), "stored-refresh")

	# ─── Recovery ───────────────────────────────────────────────────────────

	def _refuses(self, status: int, body: str = ""):
		"""Stand in for a platform that answers with a status and nothing useful."""
		class Answer:
			status_code = status
			text = body

			def json(inner):
				raise ValueError("not json")

		return lambda url, **kwargs: Answer()

	def test_an_unreachable_platform_does_not_end_the_session(self):
		"""The fault that signed everybody out whenever the service restarted.

		Renewal had two answers — a token, or nothing — and everything that was
		not a token was read as "this session is over": both credentials erased,
		the customer sent back to the sign-in screen. So a few seconds in which
		the agent service could not be reached cost every customer on the site
		their session, for a reason that had nothing to do with their session.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		def unreachable(url, **kwargs):
			raise Exception("connection refused")

		with patch("requests.post", unreachable):
			verdict, token = token_verdict(self.email)

		self.assertEqual(verdict, UNREACHABLE)
		self.assertIsNone(token)
		self.assertEqual(self._stored("refresh_token"), "stored-refresh")

	def test_a_broken_platform_does_not_end_the_session_either(self):
		"""A 500 is our fault, not the customer's credential."""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		with patch("requests.post", self._refuses(503)):
			verdict, _token = token_verdict(self.email)

		self.assertEqual(verdict, UNREACHABLE)
		self.assertEqual(self._stored("refresh_token"), "stored-refresh")

	def test_only_a_refusal_ends_a_session(self):
		"""When the platform itself says the session is over, it is over."""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(30),
			refresh_token="stored-refresh",
		)

		with patch("requests.post", self._refuses(401, "session ended")):
			verdict, _token = token_verdict(self.email)

		self.assertEqual(verdict, REFUSED)

	def test_a_rejected_token_is_never_handed_back(self):
		"""Recovery from a rejection has to produce a DIFFERENT token.

		A token the platform has just refused still looks perfectly good on this
		side — it has minutes left on its clock — so every shortcut that avoids
		a renewal would return it again. Recovery then retried with the very
		token that had been rejected, failed identically, and reported the
		session as dead.
		"""
		refused_token = self._token_expiring_in(900)
		save_agent_settings(
			self.email, access_token=refused_token, refresh_token="stored-refresh",
		)

		calls = []
		with patch("requests.post", self._platform_returns(calls)):
			verdict, token = token_verdict(self.email, refused=refused_token)

		self.assertEqual(verdict, RENEWED)
		self.assertNotEqual(token, refused_token)
		self.assertEqual(calls, [{"refresh_token": "stored-refresh"}])

	def test_a_turn_recovers_from_a_refused_token_without_the_customer_noticing(self):
		"""The whole promise, end to end: a 401 becomes a retry, not a sign-in.

		The platform refuses the first request, the token is renewed, and the
		same request goes again with the new one. Nothing reaches the customer
		but the answer.
		"""
		refused_token = self._token_expiring_in(900)
		save_agent_settings(
			self.email, access_token=refused_token, refresh_token="stored-refresh",
		)

		sent = []

		class Answer:
			def __init__(self, status):
				self.status_code = status

		def send(headers):
			sent.append(headers["Authorization"])
			return Answer(401 if len(sent) == 1 else 200)

		with patch("requests.post", self._platform_returns([])):
			response = call_the_platform(self.email, send)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(sent), 2)
		self.assertNotEqual(sent[0], sent[1])

	def test_a_401_we_cannot_recover_from_leaves_the_credentials_alone(self):
		"""A rejected token plus an unreachable platform is not an ended session.

		This is the exact sequence that used to sign customers out: the service
		restarts, one request in flight is refused, the renewal cannot connect,
		and the old code erased both credentials on the spot.
		"""
		save_agent_settings(
			self.email,
			access_token=self._token_expiring_in(900),
			refresh_token="stored-refresh",
		)

		def unreachable(url, **kwargs):
			raise Exception("connection refused")

		class Answer:
			status_code = 401

		with patch("requests.post", unreachable):
			with self.assertRaises(PlatformUnreachable):
				call_the_platform(self.email, lambda headers: Answer())

		self.assertEqual(self._stored("refresh_token"), "stored-refresh")

