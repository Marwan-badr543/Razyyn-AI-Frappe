/**
 * Chat Session Manager Module
 * ----------------------------
 * Encapsulates chat session state and server communications:
 * list loading, session selection, draft creation, renaming, and deletion.
 */

class ChatSessionManager {
	constructor(chat_instance) {
		this.chat = chat_instance;
		this.chats = [];
		this.session_id = null;
		this.is_new_chat_draft = false;
	}

	async load_chats(reload_active = true) {
		try {
			this.chats = await frappe.xcall(
				"accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_chats"
			);

			this.render_chat_list();

			if (this.chats.length > 0) {
				let active_exists = this.chats.some((c) => c.session_id === this.session_id);
				if (!active_exists) {
					this.session_id = this.chats[0].session_id;
					this.is_new_chat_draft = false;
					await this.select_chat(this.session_id);
				} else if (reload_active) {
					await this.select_chat(this.session_id);
				}
			} else {
				this.set_new_chat_draft();
			}
		} catch (e) {
			console.error("Error loading chats:", e);
		}
	}

	render_chat_list() {
		let $sidebar = this.chat.sidebar;
		if (!$sidebar) return;

		let list_container = $sidebar.find(".agent-chat-list").empty();

		this.chats.forEach((chat) => {
			let is_streaming =
				this.chat.active_streams && this.chat.active_streams[chat.session_id];
			let streaming_indicator = is_streaming
				? `<span class="agent-sidebar-spinner"><i class="fa fa-spinner fa-spin" style="color: var(--chat-primary);"></i></span>`
				: "";

			let chat_item = $(`
				<div class="agent-chat-item ${chat.session_id === this.session_id ? "active" : ""}" data-id="${
				chat.session_id
			}">
					<div class="chat-item-title-wrapper">
						<i class="fa fa-comment-o chat-icon"></i>
						<span class="chat-title">${chat.title || __("New Chat")}</span>
						${streaming_indicator}
					</div>
					<div class="chat-item-actions">
						<button class="chat-action-btn rename-btn" title="${__("Rename")}">
							<i class="fa fa-pencil"></i>
						</button>
						<button class="chat-action-btn delete-btn" title="${__("Delete")}">
							<i class="fa fa-trash-o"></i>
						</button>
					</div>
				</div>
			`);

			chat_item.on("click", (e) => {
				if ($(e.target).closest(".chat-action-btn").length === 0) {
					this.select_chat(chat.session_id);
				}
			});

			chat_item.find(".rename-btn").on("click", () => {
				this.rename_chat(chat.session_id, chat.title);
			});

			chat_item.find(".delete-btn").on("click", () => {
				this.delete_chat_session(chat.session_id);
			});

			list_container.append(chat_item);
		});
	}

	async select_chat(session_id) {
		if (this.session_id) {
			this.chat.message_handler.save_draft(this.session_id);
		}
		this.session_id = session_id;
		this.is_new_chat_draft = false;

		if (this.chat.sidebar) {
			this.chat.sidebar.find(".agent-chat-item").removeClass("active");
			this.chat.sidebar.find(`.agent-chat-item[data-id="${session_id}"]`).addClass("active");
		}

		await this.load_chat_history();

		if (this.session_id === session_id) {
			this.chat.message_handler.restore_draft(session_id);

			// Rebuild active stream bubble if session is currently streaming
			if (this.chat.active_streams && this.chat.active_streams[session_id]) {
				let stream = this.chat.active_streams[session_id];
				this.chat.ui_manager.create_stream_bubble(
					this.chat.msg_box,
					stream.bubble_id,
					session_id
				);

				if (stream.steps.length > 0 || stream.status) {
					this.chat.ui_manager.update_stream_status(
						this.chat.msg_box,
						stream.bubble_id,
						stream.status,
						stream.steps
					);
				}
				if (stream.reasoning) {
					this.chat.ui_manager.update_stream_reasoning(
						this.chat.msg_box,
						stream.bubble_id,
						stream.reasoning
					);
				}
				if (stream.accumulated) {
					this.chat.ui_manager.update_stream_bubble(
						this.chat.msg_box,
						stream.bubble_id,
						stream.accumulated
					);
				}
				if (stream.todo) {
					this.chat.ui_manager.render_todo_list(
						this.chat.msg_box,
						stream.bubble_id,
						stream.todo
					);
				}
				this.chat.ui_manager.update_thinking_duration(
					this.chat.msg_box,
					stream.bubble_id,
					stream.elapsed_seconds
				);

				// Expand accordion body for active stream
				let row = this.chat.msg_box.find(`#row-${stream.bubble_id}`);
				row.find(".thinking-body-content").show();
				row.find(".thinking-header-icon").css("transform", "rotate(90deg)");

				this.chat.message_handler.set_button_state("cancel");
			} else if (this.chat.message_handler.processing_sessions.has(session_id)) {
				this.chat.message_handler.set_button_state("cancel");
			} else {
				this.chat.message_handler.set_button_state("send");
			}

			this.chat.ui_manager.force_scroll_to_bottom(this.chat.msg_box);

			if (this.chat.message_handler.clarifications[session_id]) {
				this.chat.message_handler.render_popup_question(session_id);
			} else {
				this.chat.popup_container.hide().empty();
			}
		}
	}

	set_new_chat_draft() {
		if (this.session_id) {
			this.chat.message_handler.save_draft(this.session_id);
		}
		this.chat.ui_manager.clear_typing_timers();
		this.is_new_chat_draft = true;
		this.session_id = this.chat.generate_uuid();

		if (this.chat.sidebar) {
			this.chat.sidebar.find(".agent-chat-item").removeClass("active");
		}

		this.chat.ui_manager.render_welcome(this.chat.msg_box);
		this.chat.message_handler.restore_draft(this.session_id);
		this.chat.message_handler.set_button_state("send");
		this.chat.popup_container.hide().empty();
	}

	rename_chat(session_id, current_title) {
		frappe.prompt(
			[
				{
					label: __("Chat Title"),
					fieldname: "title",
					fieldtype: "Data",
					default: current_title,
					reqd: 1,
				},
			],
			async (values) => {
				frappe.dom.freeze(__("Renaming..."));
				try {
					await frappe.xcall(
						"accountant_agent.accountant_agent.page.agent_chat.agent_chat.update_chat_title",
						{ session_id: session_id, title: values.title }
					);
					await this.load_chats();
				} catch (e) {
					console.error("Rename chat failed:", e);
				} finally {
					frappe.dom.unfreeze();
				}
			},
			__("Rename Chat"),
			__("Save")
		);
	}

	delete_chat_session(session_id) {
		frappe.confirm(
			__(
				"Are you sure you want to delete this chat session? All its messages will be permanently deleted."
			),
			async () => {
				frappe.dom.freeze(__("Deleting chat..."));
				try {
					await frappe.xcall(
						"accountant_agent.accountant_agent.page.agent_chat.agent_chat.delete_chat",
						{ session_id: session_id }
					);

					if (this.session_id === session_id) {
						this.session_id = null;
					}
					await this.load_chats();
				} catch (e) {
					console.error("Delete chat failed:", e);
				} finally {
					frappe.dom.unfreeze();
				}
			}
		);
	}

	async load_chat_history() {
		this.chat.ui_manager.clear_typing_timers();
		this.chat.ui_manager.user_pinned_to_bottom = true;
		this.chat.ui_manager._toggle_scroll_to_bottom_btn(false);
		this.chat.msg_box.empty();
		if (!this.session_id || this.is_new_chat_draft) {
			this.chat.ui_manager.render_welcome(this.chat.msg_box);
			return;
		}

		try {
			let messages = await frappe.xcall(
				"accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_chat_history",
				{ session_id: this.session_id }
			);

			if (messages && messages.length > 0) {
				messages.forEach((msg, idx) => {
					let has_subsequent = idx < messages.length - 1;
					this.chat.ui_manager.append_message(
						this.chat.msg_box,
						msg.sender,
						msg.content,
						false,
						msg.creation || msg.creation1,
						has_subsequent,
						msg.name
					);
				});
			} else {
				this.chat.ui_manager.render_welcome(this.chat.msg_box);
			}

			// Rebuild active stream bubble if session is currently streaming
			if (this.chat.active_streams && this.chat.active_streams[this.session_id]) {
				let stream = this.chat.active_streams[this.session_id];
				this.chat.ui_manager.create_stream_bubble(
					this.chat.msg_box,
					stream.bubble_id,
					this.session_id
				);

				if (stream.steps.length > 0 || stream.status) {
					this.chat.ui_manager.update_stream_status(
						this.chat.msg_box,
						stream.bubble_id,
						stream.status,
						stream.steps
					);
				}
				if (stream.reasoning) {
					this.chat.ui_manager.update_stream_reasoning(
						this.chat.msg_box,
						stream.bubble_id,
						stream.reasoning
					);
				}
				if (stream.accumulated) {
					this.chat.ui_manager.update_stream_bubble(
						this.chat.msg_box,
						stream.bubble_id,
						stream.accumulated
					);
				}
				if (stream.todo) {
					this.chat.ui_manager.render_todo_list(
						this.chat.msg_box,
						stream.bubble_id,
						stream.todo
					);
				}
				this.chat.ui_manager.update_thinking_duration(
					this.chat.msg_box,
					stream.bubble_id,
					stream.elapsed_seconds
				);

				let row = this.chat.msg_box.find(`#row-${stream.bubble_id}`);
				row.find(".thinking-body-content").show();
				row.find(".thinking-header-icon").css("transform", "rotate(90deg)");

				this.chat.message_handler.set_button_state("cancel");
			} else {
				// No live stream in memory (page was reloaded): ask the server
				// whether the manager still has an unfinished checklist for this
				// session and redraw it. One call per open, never polled — live
				// updates arrive over the socket.
				this.restore_todo_state();
			}
		} catch (e) {
			console.error("Error loading chat history:", e);
			this.chat.ui_manager.render_welcome(this.chat.msg_box);
		}

		// A REBUILT TRANSCRIPT ALWAYS SHOWS ITS NEWEST MESSAGE.
		//
		// This method empties the box and re-appends every message, which
		// leaves the scroll at the very top — the first thing the customer
		// ever said. `switch_session` scrolled after calling this, so opening
		// a chat looked right; answering a question did not, because
		// `submit_clarification_popup` reloads the history to redraw the
		// settled fold and had no scroll of its own. It belongs here, where
		// the rebuild happens, not at one of the two call sites.
		//
		// Twice: once now, and once after the browser has laid the messages
		// out, because charts, tables and file chips gain their height a
		// frame later and would otherwise leave the view mid-transcript.
		this.chat.ui_manager.force_scroll_to_bottom(this.chat.msg_box);
		let msg_box = this.chat.msg_box;
		let ui = this.chat.ui_manager;
		requestAnimationFrame(() => ui.force_scroll_to_bottom(msg_box));
	}

	async restore_todo_state() {
		let session_id = this.session_id;
		if (!session_id || this.is_new_chat_draft) return;
		try {
			let agent_email = localStorage.getItem("connected_agent_email");
			if (!agent_email) return;
			let state = await frappe.xcall(
				"accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_run_state",
				{ session_id: session_id, agent_email: agent_email }
			);
			// Only a run that is still going (or waiting on the customer) is
			// worth redrawing; a finished run's report is already in history.
			if (
				this.session_id === session_id &&
				state &&
				(state.status === "active" || state.status === "paused") &&
				Array.isArray(state.tasks) &&
				state.tasks.length
			) {
				this.chat.ui_manager.render_todo_standalone(this.chat.msg_box, state);
			}
		} catch (e) {
			console.error("Could not restore the task list:", e);
		}
	}
}
