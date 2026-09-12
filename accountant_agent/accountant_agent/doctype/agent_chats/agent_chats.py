# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AgentChats(Document):
	def after_delete(self):
		# Cascade delete all related messages in Agent Chat History with this session_id
		frappe.db.delete("Agent Chat History", {"session_id": self.session_id})

	def get_backend_session_id(self) -> str:
		"""The thread id to send to the Razyyn agent server.

		Starts out equal to `session_id`. Editing a message mints a fresh
		value here (see `edit_message` in agent_chat.py) so the agent's own
		conversation state starts clean instead of carrying the discarded
		turns forward -- while this chat's identity (`session_id`, its rows
		in Agent Chat History, its place in the sidebar) never changes.
		"""
		return self.backend_session_id or self.session_id
