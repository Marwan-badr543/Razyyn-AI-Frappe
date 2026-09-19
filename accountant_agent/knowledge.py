"""Company accounting-policy bridge from Frappe to the agent platform.

The browser sends a PDF directly to this whitelisted method. It is forwarded
from the request stream and never saved as a Frappe File document or copied to
disk. The platform extracts searchable text and deletes its own temporary copy.
"""

from __future__ import annotations

import base64
import json

import frappe
import requests
from frappe import _

from accountant_agent.accountant_agent.doctype.agent_settings.agent_settings import (
	get_agent_server_url,
)
from accountant_agent.connect import _settings_doc

_TIMEOUT_SECONDS = 90


def _credentials(email: str) -> tuple[object, str]:
	from accountant_agent.accountant_agent.page.agent_chat.agent_chat import (
		get_agent_access_token,
	)

	doc = _settings_doc(email)
	token = get_agent_access_token(doc.email)
	if not token:
		frappe.throw(
			_("Please sign in to the Accountant Agent from the chat page first."),
			frappe.AuthenticationError,
		)
	return doc, token


def _renew(email: str) -> str:
	from accountant_agent.accountant_agent.page.agent_chat.agent_chat import (
		refresh_agent_token_on_server,
	)

	token = refresh_agent_token_on_server(email)
	if not token:
		frappe.throw(_("Your Accountant Agent session has expired."), frappe.AuthenticationError)
	return token


def _detail(response: requests.Response) -> str:
	try:
		body = response.json()
		value = body.get("detail") or body.get("message") or body.get("error")
		if isinstance(value, list):
			return "; ".join(str(item.get("msg") or item) for item in value[:3])
		return str(value or "")
	except ValueError:
		return ""


def _send(method: str, path: str, email: str, **kwargs) -> requests.Response:
	doc, token = _credentials(email)
	url = f"{get_agent_server_url()}{path}"
	try:
		response = requests.request(
			method, url, headers={"Authorization": f"Bearer {token}"},
			timeout=_TIMEOUT_SECONDS, **kwargs,
		)
		if response.status_code == 401:
			token = _renew(doc.email)
			if "files" in kwargs:
				for _name, value in kwargs["files"].items():
					value[1].seek(0)
			response = requests.request(
				method, url, headers={"Authorization": f"Bearer {token}"},
				timeout=_TIMEOUT_SECONDS, **kwargs,
			)
	except requests.exceptions.RequestException as exc:
		frappe.log_error(title="Accountant Agent: knowledge upload", message=str(exc))
		frappe.throw(_("Could not reach the Accountant Agent service. Try again shortly."))
	if response.status_code >= 400:
		frappe.throw(_(_detail(response) or "The knowledge request was refused."))
	return response


@frappe.whitelist()
def upload_company_knowledge(email: str, title: str = "Company accounting policy") -> dict:
	"""Forward one embedded-text PDF without retaining the source in Frappe."""
	upload = frappe.request.files.get("file")
	if not upload or not str(upload.filename or "").lower().endswith(".pdf"):
		frappe.throw(
			_("Choose a searchable text PDF. Scanned/image PDFs are not accepted."),
			frappe.ValidationError,
		)
	response = _send(
		"POST", "/knowledge/company", email,
		data={"title": title or "Company accounting policy"},
		files={"file": (upload.filename, upload.stream, "application/pdf")},
	)
	return response.json()


@frappe.whitelist()
def get_company_knowledge(email: str) -> dict:
	return _send("GET", "/knowledge", email).json()


@frappe.whitelist()
def delete_company_knowledge(email: str, document_id: str) -> dict:
	_send("DELETE", f"/knowledge/company/{document_id}", email)
	return {"deleted": True}


@frappe.whitelist()
def set_company_country(email: str, country_code: str) -> dict:
	"""Set the jurisdiction that controls optional country retrieval."""
	doc, token = _credentials(email)
	try:
		claims = json.loads(
			base64.urlsafe_b64decode(
				token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)
			).decode("utf-8")
		)
	except Exception:
		frappe.throw(_("Could not identify the connected agent account."))
	user_id = claims.get("sub")
	if not user_id:
		frappe.throw(_("Could not identify the connected agent account."))
	response = _send(
		"PATCH", f"/users/{user_id}", doc.email,
		json={"country_code": str(country_code or "").strip().upper()},
	)
	return response.json()
