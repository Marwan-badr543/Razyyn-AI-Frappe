# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Where this app's settings come from, now that they come with the app.

    cd ~/frappe/frappe-bench-v14 && bench --site v14.local run-tests \\
        --module accountant_agent.tests.test_configuration
"""

from __future__ import annotations

import json
import os
import subprocess

import frappe
from frappe.tests.utils import FrappeTestCase

from accountant_agent import agent_config


class TestConfiguration(FrappeTestCase):
	def setUp(self):
		# Each test starts from the file, not from whatever a previous test read.
		agent_config._file_config = None

	def tearDown(self):
		agent_config._file_config = None

	def test_the_settings_file_ships_with_the_app(self):
		"""The whole reason this exists.

		The service address used to live in a `.env` file, which version control
		deliberately excludes because that is where secrets go. Nobody who
		installed this app from its repository ever received one, so every
		installation silently fell back to a localhost address — correct on a
		developer's laptop and wrong on every real deployment.
		"""
		self.assertTrue(os.path.exists(agent_config._CONFIG_PATH))

		with open(agent_config._CONFIG_PATH, encoding="utf-8") as handle:
			shipped = json.load(handle)

		self.assertIn("agent_server_url", shipped)
		self.assertIn("ocr_languages", shipped)
		self.assertIn("max_upload_files", shipped)

	def test_version_control_actually_carries_it(self):
		"""A committed setting that git ignores is the same bug in a new file."""
		app_root = os.path.dirname(os.path.dirname(agent_config._CONFIG_PATH))
		if not os.path.isdir(os.path.join(app_root, ".git")):
			self.skipTest("this bench's copy of the app is not a git checkout")

		ignored = subprocess.run(
			["git", "check-ignore", agent_config._CONFIG_PATH],
			cwd=app_root,
			capture_output=True,
		)
		self.assertNotEqual(
			ignored.returncode,
			0,
			"agent_config.json is excluded from version control",
		)

	def test_the_address_is_read_from_the_file(self):
		url = agent_config.get_agent_server_url()

		self.assertTrue(url.startswith("http"))
		self.assertFalse(url.endswith("/"), "a trailing slash doubles every path")

	def test_one_site_can_still_point_somewhere_else(self):
		"""A bench hosts several sites and one of them may use another service.

		Overridden through `site_config.json`, which is the mechanism Frappe
		administrators already know, rather than a second bespoke one.
		"""
		frappe.conf["accountant_agent_server_url"] = "https://razyyn.example.com/"
		try:
			self.assertEqual(
				agent_config.get_agent_server_url(),
				"https://razyyn.example.com",
			)
		finally:
			frappe.conf.pop("accountant_agent_server_url", None)

	def test_a_damaged_file_does_not_take_the_app_down(self):
		"""It falls back to the built-in defaults and says so in the error log."""
		agent_config._file_config = {}

		self.assertEqual(
			agent_config.get_agent_server_url(),
			agent_config._DEFAULTS["agent_server_url"].rstrip("/"),
		)
		self.assertEqual(agent_config.get_max_upload_files(), 20)

	def test_nothing_in_the_app_reads_a_dotenv_file_any_more(self):
		"""Leaving the old path in place as a fallback preserves the confusion."""
		app_package = os.path.dirname(agent_config._CONFIG_PATH)

		offenders = []
		for root, _dirs, files in os.walk(app_package):
			# The tests themselves name the old mechanism in order to forbid it.
			if "__pycache__" in root or os.path.basename(root) == "tests":
				continue
			for name in files:
				if not name.endswith(".py") or name == "agent_config.py":
					continue
				path = os.path.join(root, name)
				with open(path, encoding="utf-8") as handle:
					body = handle.read()
				if "ACCOUNTANT_AGENT_SERVER_URL" in body or "_load_env" in body:
					offenders.append(path)

		self.assertEqual(offenders, [])
