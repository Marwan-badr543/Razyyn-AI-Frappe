# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""The app's own settings, in a file that ships with the app.

WHY NOT A `.env` FILE
    The address of the Razyyn service used to be read from a `.env` file at the
    app root. `.env` is deliberately excluded from version control — it is where
    secrets live — so nobody who installed this app from GitHub ever received
    one, and the app silently fell back to a localhost address that is correct
    on a developer's laptop and wrong everywhere else. A setting that every
    installation needs and nobody is given is a setting that does not work.

    `agent_config.json` sits beside this module, is committed, and is therefore
    part of every checkout and every `bench get-app`. There is nothing secret in
    it: the service address is public information, and the credentials that open
    the service are per-user and encrypted in the database.

HOW A SINGLE SITE OVERRIDES IT
    A bench can host several sites, and one of them may need to point somewhere
    else. Any value here can be overridden per site by the matching key in that
    site's `site_config.json`, which is the mechanism Frappe administrators
    already know. The order is: this site's own configuration first, then the
    file below, then the built-in default.

WHY THE FILE IS READ ONCE
    `get_agent_server_url` is called on the path of every message and every tool
    call. Opening and parsing a file each time is the repeated I/O the project
    rules exist to prevent, and the answer never changes while the process runs.
    A change to this file takes effect on the next `bench restart`, which is the
    same rule that already applies to `site_config.json`.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import frappe

#: Beside this module, so the location holds wherever the app is installed and
#: whether or not a Frappe site happens to be initialised at import time.
_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_config.json")

#: Used when the file is missing or unreadable — an installation should never
#: be left with no address at all just because a file was damaged.
_DEFAULTS: dict = {
	"agent_server_url": "http://127.0.0.1:8010",
	"ocr_languages": "eng+ara",
	"max_upload_files": 20,
}

_file_config: dict | None = None


def _from_file() -> dict:
	"""The committed configuration, parsed once per process."""
	global _file_config
	if _file_config is not None:
		return _file_config

	try:
		with open(_CONFIG_PATH, encoding="utf-8") as handle:
			loaded = json.load(handle)
		_file_config = loaded if isinstance(loaded, dict) else {}
	except FileNotFoundError:
		_file_config = {}
	except Exception as exc:
		# A damaged config file must not take the app down; it must be visible.
		frappe.log_error(
			title="Accountant Agent: configuration file",
			message=f"Could not read {_CONFIG_PATH}: {exc}. Using built-in defaults.",
		)
		_file_config = {}

	return _file_config


def get_setting(key: str) -> Any:
	"""One setting, with the site's own configuration taking precedence."""
	site_value = frappe.conf.get(f"accountant_agent_{key}") if frappe.conf else None
	if site_value not in (None, ""):
		return site_value

	file_value = _from_file().get(key)
	if file_value not in (None, ""):
		return file_value

	return _DEFAULTS.get(key)


def get_agent_server_url() -> str:
	"""Base URL of the Razyyn service this installation talks to."""
	return str(get_setting("agent_server_url")).rstrip("/")


def get_ocr_languages() -> str:
	"""Tesseract language codes used when reading text out of a picture.

	`eng+ara` by default because that is the readership: an Arabic invoice with
	English figures and an English invoice are both ordinary here, and Tesseract
	is given both alphabets rather than asked to guess.
	"""
	return str(get_setting("ocr_languages"))


def get_max_upload_files() -> int:
	"""How many files one message may carry.

	Mirrors MAX_UPLOAD_FILES in the agent service, which is the limit that
	actually applies. It is repeated here — in a file, not in code — because
	this side has to tell the customer before the upload rather than after it,
	and because a practice running its own service may have changed it.
	"""
	try:
		return max(1, int(get_setting("max_upload_files")))
	except (TypeError, ValueError):
		return int(_DEFAULTS["max_upload_files"])
