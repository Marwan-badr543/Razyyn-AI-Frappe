/**
 * Chat UI Manager Module
 * ----------------------
 * Handles chat layout rendering, message bubbles, typing indicators,
 * live stream typing animation, markdown parsing, and popup rendering.
 */

class ChatUIManager {
	constructor(chat_instance) {
		this.chat = chat_instance;
		this.typing_timers = [];
		//: Whether the user's own scroll position is (still) at the bottom of
		//: the thread. Set from a real 'scroll' event, not re-guessed on every
		//: stream update — see `_ensure_scroll_tracking` for why a proximity
		//: check alone let auto-scroll fight a user trying to read upward
		//: while a reply is still coming in.
		this.user_pinned_to_bottom = true;
		//: The newest drawing of each live region, waiting for the next
		//: animation frame. See _schedule_draw.
		this.pending_draws = new Map();
		this.draw_frame = null;
	}

	// ─── One drawing per frame, not one per event ────────────────────────
	//
	// WHY THE CHAT USED TO STOP RESPONDING DURING A LONG ANSWER.
	//
	// The agent's answer and its reasoning arrive as hundreds or thousands
	// of small pieces, and each piece used to redraw the WHOLE of what had
	// arrived so far: parse all of it as Markdown, sanitise all of it,
	// replace the element, then measure the page to decide about scrolling.
	// The cost of one piece therefore grew with the length of the answer,
	// and the cost of the answer grew with the SQUARE of its length. A long
	// audit — tens of thousands of words, most of it working notes — spent
	// minutes of processor time redrawing text that had already been drawn,
	// and the browser, unable to do anything else in the meantime, offered
	// to close the page.
	//
	// A screen refreshes about sixty times a second, so a drawing that
	// happens more often than that is thrown away unseen. This keeps only
	// the NEWEST drawing of each region and performs it once per refresh.
	// Nothing is lost — the text itself is accumulated as it arrives, by
	// the caller — and the cost of an answer becomes proportional to how
	// long it takes rather than to the square of its length.
	_schedule_draw(key, draw) {
		this.pending_draws.set(key, draw);
		if (this.draw_frame !== null) return;
		this.draw_frame = requestAnimationFrame(() => {
			this.draw_frame = null;
			let due = this.pending_draws;
			this.pending_draws = new Map();
			due.forEach((run) => {
				try {
					run();
				} catch (e) {
					console.error("Chat draw failed:", e);
				}
			});
		});
	}

	// A bubble that has been finalised must not be overwritten a frame
	// later by the last unfinished drawing of the same bubble. Keyed by
	// bubble, so finishing one conversation never drops another's.
	_cancel_draws(bubble_id) {
		if (!bubble_id) return;
		[...this.pending_draws.keys()].forEach((key) => {
			if (key.indexOf(bubble_id + ":") === 0) this.pending_draws.delete(key);
		});
	}

	clear_typing_timers() {
		if (this.typing_timers && this.typing_timers.length > 0) {
			this.typing_timers.forEach((timer) => clearTimeout(timer));
			this.typing_timers = [];
		}
	}

	render_welcome(msg_box) {
		msg_box.empty();
		this.user_pinned_to_bottom = true;
		this._toggle_scroll_to_bottom_btn(false);
		let welcome_html = `
			<div class="agent-welcome-state">
				<div class="agent-welcome-icon">
					<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
						<defs>
							<linearGradient id="robotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" stop-color="#5b45e0" />
								<stop offset="100%" stop-color="#7c6cf0" />
							</linearGradient>
						</defs>
						<rect x="8" y="16" width="48" height="36" rx="10" fill="url(#robotGrad)" />
						<rect x="28" y="6" width="8" height="10" fill="url(#robotGrad)" />
						<circle cx="32" cy="5" r="4" fill="url(#robotGrad)" />
						<rect x="4" y="26" width="4" height="16" rx="2" fill="url(#robotGrad)" />
						<rect x="56" y="26" width="4" height="16" rx="2" fill="url(#robotGrad)" />
						<rect x="13" y="21" width="38" height="26" rx="6" fill="#ffffff" />
						<circle cx="23" cy="30" r="4" fill="url(#robotGrad)" />
						<circle cx="41" cy="30" r="4" fill="url(#robotGrad)" />
						<path d="M22 38 Q32 43 42 38" stroke="url(#robotGrad)" stroke-width="3" stroke-linecap="round" fill="none" />
					</svg>
				</div>
				<h3>${__("Welcome to Razyyn AI")}</h3>
				<p class="text-muted" style="max-width: 440px; margin: 0 auto; font-size: 14px; line-height: 1.5;">
					${__(
						"One assistant, a whole accounting team behind it. Describe what you need — even several jobs at once — and watch the task list get done."
					)}
				</p>
				<div class="agent-suggestions-grid">
					<div class="agent-suggestion-card" data-prompt="${__(
						"Reconcile this bank statement against my bank ledger, find every discrepancy, and create the journal entries needed to settle the differences."
					)}">
						<div class="agent-suggestion-card-header">
							<i class="fa fa-balance-scale"></i>
							${__("Reconcile bank entries")}
						</div>
						<div class="agent-suggestion-card-desc">
							${__(
								"Compare bank statements and ledger entries, then post the entries that settle the differences."
							)}
						</div>
					</div>
					<div class="agent-suggestion-card" data-prompt="${__(
						"Analyse my sales this year by customer and month, chart the trend, and generate an Excel report of the results."
					)}">
						<div class="agent-suggestion-card-header">
							<i class="fa fa-bar-chart"></i>
							${__("Analyse my numbers")}
						</div>
						<div class="agent-suggestion-card-desc">
							${__("Deep analysis with charts — and the results exported to an Excel file for you.")}
						</div>
					</div>
					<div class="agent-suggestion-card" data-prompt="${__(
						"Audit my general ledger for last quarter for anomalies and control violations, and send me the findings summary on Telegram."
					)}">
						<div class="agent-suggestion-card-header">
							<i class="fa fa-shield"></i>
							${__("Audit my books")}
						</div>
						<div class="agent-suggestion-card-desc">
							${__("Inspect your records for anomalies and fraud — and get the findings sent to your Telegram.")}
						</div>
					</div>
					<div class="agent-suggestion-card" data-prompt="${__(
						"Create a payment entry of 5,000 for supplier ABC against invoice INV-001, and email me the confirmation on Gmail."
					)}">
						<div class="agent-suggestion-card-header">
							<i class="fa fa-pencil-square-o"></i>
							${__("Record documents")}
						</div>
						<div class="agent-suggestion-card-desc">
							${__(
								"Prepare entries, payments and invoices for your approval — with the confirmation emailed to you."
							)}
						</div>
					</div>
					<div class="agent-suggestion-card" data-prompt="${__(
						"What is my current cash position and who are my top 5 overdue customers? Generate the overdue list as an Excel file."
					)}">
						<div class="agent-suggestion-card-header">
							<i class="fa fa-comments"></i>
							${__("Ask about your business")}
						</div>
						<div class="agent-suggestion-card-desc">
							${__("Instant answers from your live records — exportable to Excel whenever you need a file.")}
						</div>
					</div>
				</div>
			</div>
		`;
		msg_box.append(welcome_html);

		// Bind events to the suggestion cards
		let self = this;
		msg_box.find(".agent-suggestion-card").on("click", function (e) {
			let prompt = $(this).data("prompt");
			self.chat.textarea.val(prompt);
			self.chat.textarea.trigger("input");
			self.chat.textarea.focus();
		});
	}

	format_time(datetime_str) {
		if (!datetime_str) return "";
		try {
			let clean_str =
				typeof datetime_str === "string" ? datetime_str.replace(" ", "T") : datetime_str;
			let date_obj = new Date(clean_str);
			if (isNaN(date_obj.getTime())) return datetime_str;
			return date_obj.toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: true,
			});
		} catch (e) {
			return datetime_str;
		}
	}

	render_plan_card(bubble_el, content_json, datetime = null) {
		try {
			let data = typeof content_json === "string" ? JSON.parse(content_json) : content_json;
			if (!data || data.type !== "plan") return false;

			let plan_text = data.plan || "";
			let status = data.status || "pending";
			// A CARD THE CUSTOMER MUST READ OPENS OPEN. A proposed plan is a
			// summary they can glance past, so it stays folded. A message
			// waiting to be sent is the opposite: the recipient, the wording
			// and the files are the whole reason they are being asked, and a
			// card they have to click before they can see any of it is an
			// approval they will give without looking.
			let starts_open = data.expanded === true;
			// THE CARD NAMES WHAT IT IS ASKING FOR. "Proposed Execution Plan"
			// and "Approve & Run" are right for a plan of work and wrong for a
			// message about to leave — the customer has to know they are
			// approving a send, not a piece of work. The server supplies both
			// words, already in their language; the defaults are what a plan
			// has always said.
			let card_title = data.title || __("Proposed Execution Plan");
			let approve_label = data.approve_label || __("Approve & Run");
			let approve_reply = data.approve_reply || "Approve";
			let parsed_markdown = this.parse_markdown(plan_text);

			let header_id = `plan-hdr-${this.chat.generate_uuid()}`;
			let body_id = `plan-body-${this.chat.generate_uuid()}`;
			let container_id = `plan-container-${this.chat.generate_uuid()}`;
			let btn_id = `plan-btn-${this.chat.generate_uuid()}`;

			let actions_html = "";
			if (status === "pending") {
				actions_html = `
					<div class="plan-actions-wrapper">
						<button class="plan-btn-approve" id="${btn_id}">
							<i class="fa fa-play"></i>
							<span>${frappe.utils.escape_html(approve_label)}</span>
						</button>
					</div>
				`;
			}

			let plan_html = `
				<div class="plan-card-container${starts_open ? "" : " collapsed"}" id="${container_id}">
					<div class="plan-card-header" id="${header_id}">
						<div class="plan-title-wrapper">
							<i class="fa fa-list-alt" style="color: var(--chat-primary);"></i>
							<span>${frappe.utils.escape_html(card_title)}</span>
						</div>
						<i class="fa fa-chevron-down plan-caret-icon"></i>
					</div>
					<div class="plan-card-body" id="${body_id}">
						<div class="plan-content-markdown">${parsed_markdown}</div>
						${actions_html}
					</div>
				</div>
			`;

			// The checklist lives in this bubble too, and emptying the bubble
			// is what used to make it vanish the moment the agent asked for an
			// approval — exactly when the customer most wants to see where the
			// work stands. Keep the wrapper, replace only the message body.
			let $todo = bubble_el.find(".agent-todo-wrapper").detach();
			bubble_el.empty();
			if ($todo.length) bubble_el.append($todo);
			bubble_el.append(plan_html);

			// Click to expand/collapse
			let container = bubble_el.find(`#${container_id}`);
			bubble_el.find(`#${header_id}`).on("click", () => {
				container.toggleClass("collapsed");
			});

			// Approve button handler
			if (status === "pending") {
				let btn = bubble_el.find(`#${btn_id}`);
				btn.on("click", (e) => {
					e.stopPropagation();

					// Disable button immediately to prevent double-clicks
					btn.attr("disabled", "disabled");
					btn.css("opacity", "0.6");
					btn.find("span").text(__("Resuming..."));
					btn.find("i").removeClass("fa-play").addClass("fa-spinner fa-spin");

					// Send "Approve" message to resume the agent
					this.chat.message_handler.send_chat_message(approve_reply);
				});
			}

			return true;
		} catch (e) {
			console.error("Error parsing plan card JSON:", e);
			return false;
		}
	}

	append_message(
		msg_box,
		sender,
		content,
		animate = false,
		datetime = null,
		has_subsequent = false,
		message_id = null
	) {
		msg_box.find(".agent-welcome-state").remove();

		if (!content) content = "";
		let formatted_time = datetime ? this.format_time(datetime) : "";

		let is_plan = false;
		let parsed_data = null;
		if (content) {
			if (typeof content === "object") {
				if (content.type === "plan") {
					is_plan = true;
					parsed_data = content;
				}
			} else if (typeof content === "string") {
				let trimmed = content.trim();
				if (
					trimmed.startsWith("{") &&
					(trimmed.includes('"type": "plan"') || trimmed.includes('"type":"plan"'))
				) {
					try {
						let parsed = JSON.parse(trimmed);
						if (parsed && parsed.type === "plan") {
							is_plan = true;
							parsed_data = parsed;
						}
					} catch (e) {
						// Not valid JSON -- not a plan, render as plain text below.
					}
				}
			}
		}

		if (is_plan) {
			let bubble_id = `msg-${this.chat.generate_uuid()}`;
			let time_id = `time-${this.chat.generate_uuid()}`;
			let bubble_html = `
				<div class="agent-msg-row ai">
					<div class="agent-msg-bubble" id="${bubble_id}" style="background: transparent; border: none; padding: 0; box-shadow: none; max-width: 100%;">
					</div>
					${
						formatted_time
							? `<div class="agent-msg-time" id="${time_id}" style="font-size: 10.5px; color: var(--chat-text-muted); margin-top: 4px; padding: 0 4px;">${formatted_time}</div>`
							: ""
					}
				</div>
			`;
			msg_box.append(bubble_html);
			let bubble_el = msg_box.find(`#${bubble_id}`);
			this.render_plan_card(bubble_el, parsed_data, datetime);
			this.scroll_to_bottom(msg_box);
			return Promise.resolve();
		}

		let attachments_html = "";
		let display_content = content;
		if (
			this.chat.attachments_renderer &&
			this.chat.attachments_renderer.has_attachments(content)
		) {
			let parsed = this.chat.attachments_renderer.parse_and_render(content);
			display_content = parsed.text;
			attachments_html = parsed.attachments_html;
		}

		// A STORED QUESTION STILL OFFERS ITS ANSWERS AFTER A RELOAD.
		//
		// The picker used to be reopened by parsing the raw envelope out of
		// the transcript — which only worked because the envelope was being
		// stored, and being stored is what put `{"type": "clarification", ...`
		// in a customer's chat window. The prose is stored now, with the
		// questions packed into the block as base64, so both can be true: the
		// exchange stays readable in the transcript AND the agent, which is
		// still paused and waiting, still shows you what it is waiting for.
		//
		// Unlike the branch below this one, it does NOT return early: the
		// folded question is a real message and gets drawn like one.
		// AND ONLY WHILE IT IS STILL OPEN.
		//
		// The answer now lives INSIDE the question block, so a settled exchange
		// is still the last message in the session — `has_subsequent` is false
		// for it, and without this test the picker would reopen on a question
		// the customer answered ten minutes ago. `data-answered` is written by
		// the server when it folds the reply in.
		if (
			sender === "ai" &&
			!has_subsequent &&
			display_content.indexOf('data-questions="') !== -1 &&
			display_content.indexOf('data-answered="1"') === -1
		) {
			try {
				let packed = display_content.match(/data-questions="([A-Za-z0-9+/=]*)"/);
				if (packed && packed[1]) {
					// Base64 -> bytes -> UTF-8, so a question written in
					// Arabic survives the round trip. `atob` alone would
					// mangle every non-Latin character.
					let bytes = Uint8Array.from(atob(packed[1]), (c) => c.charCodeAt(0));
					let questions = JSON.parse(new TextDecoder("utf-8").decode(bytes));
					if (Array.isArray(questions) && questions.length) {
						this.chat.show_clarification_popup(questions);
					}
				}
			} catch (e) {
				// A question we cannot reopen is not a reason to lose the
				// message: the customer can still read it and type an answer.
				console.error("Could not reopen the stored question:", e);
			}
		}

		if (sender === "ai" && display_content.startsWith('{"type": "clarification"')) {
			try {
				let data = JSON.parse(content);
				if (data && data.type === "clarification") {
					if (!has_subsequent) {
						this.chat.show_clarification_popup(data.questions);
					}

					let questions_list = data.questions || [];
					let headline =
						questions_list.length > 0
							? questions_list[0].question
							: __("Clarification Question");
					if (questions_list.length > 1) {
						headline = `${headline} (${__("and")} ${questions_list.length - 1} ${__(
							"more"
						)})`;
					}

					let body_parts = [];
					if (questions_list.length > 1) {
						questions_list.slice(1).forEach((q, idx) => {
							body_parts.push(`${idx + 2}. ${q.question}`);
						});
					}
					body_parts.push(
						`<span class="agent-answer">${__("Awaiting your answer...")}</span>`
					);
					let body = body_parts.join("\n");

					let packed_payload = btoa(
						unescape(encodeURIComponent(JSON.stringify(questions_list)))
					);
					display_content = `<details class="agent-question" data-questions="${packed_payload}"><summary>${headline}</summary>\n\n${body}\n</details>`;
				}
			} catch (e) {
				console.error("Failed to parse clarification message JSON:", e);
			}
		}

		if (animate && sender === "ai") {
			return new Promise((resolve) => {
				let bubble_id = `msg-${this.chat.generate_uuid()}`;
				let time_id = `time-${this.chat.generate_uuid()}`;
				let bubble_html = `
					<div class="agent-msg-row ai">
						<div class="agent-msg-bubble typing-active" id="${bubble_id}">
							${attachments_html}
						</div>
						${
							formatted_time
								? `<div class="agent-msg-time" id="${time_id}" style="font-size: 10.5px; color: var(--chat-text-muted); margin-top: 4px; padding: 0 4px; display: none;">${formatted_time}</div>`
								: ""
						}
					</div>
				`;

				msg_box.append(bubble_html);
				this.force_scroll_to_bottom(msg_box);

				let bubble_el = msg_box.find(`#${bubble_id}`);
				let time_el = msg_box.find(`#${time_id}`);
				let current_text = "";
				let index = 0;
				let self = this;

				let chars_per_tick = 1;
				let base_delay = 20;

				// The TYPED text is the one with the file markers taken out —
				// the chip is already drawn above. Typing the raw content put
				// the marker on screen character by character.
				if (display_content.length > 3000) {
					chars_per_tick = 4;
					base_delay = 5;
				} else if (display_content.length > 1500) {
					chars_per_tick = 3;
					base_delay = 10;
				} else if (display_content.length > 600) {
					chars_per_tick = 2;
					base_delay = 15;
				}

				function type() {
					if (!self.typing_timers.includes(timerId)) {
						resolve();
						return;
					}

					if (index < display_content.length) {
						let chunk = display_content.slice(index, index + chars_per_tick);
						current_text += chunk;
						index += chars_per_tick;

						let parsed = self.parse_markdown(current_text);
						let text_el = bubble_el.find(".agent-msg-text-content");
						if (!text_el.length) {
							bubble_el.append('<div class="agent-msg-text-content"></div>');
							text_el = bubble_el.find(".agent-msg-text-content");
						}
						text_el.html(parsed);

						if (
							index % (chars_per_tick * 3) === 0 ||
							index >= display_content.length
						) {
							self.scroll_to_bottom(msg_box);
						}

						let last_char = chunk[chunk.length - 1];
						let delay = base_delay + Math.random() * (base_delay * 0.5);
						if (last_char === " ") delay += base_delay * 0.3;
						else if ([".", ",", "?", "!", ";"].includes(last_char))
							delay += Math.min(100, base_delay * 3);
						else if (last_char === "\n") delay += Math.min(150, base_delay * 4);

						let timeout = setTimeout(type, delay);
						self.typing_timers = self.typing_timers.map((t) =>
							t === timerId ? timeout : t
						);
						timerId = timeout;
					} else {
						self.typing_timers = self.typing_timers.filter((t) => t !== timerId);
						bubble_el.removeClass("typing-active");
						let parsed = self.parse_markdown(display_content);
						let text_el = bubble_el.find(".agent-msg-text-content");
						if (!text_el.length) {
							bubble_el.append('<div class="agent-msg-text-content"></div>');
							text_el = bubble_el.find(".agent-msg-text-content");
						}
						text_el.html(parsed);
						if (time_el.length) time_el.fadeIn(300);

						// Attach copy button fixed under finished animated AI message
						let row_el = bubble_el.closest(".agent-msg-row");
						if (!row_el.find(".agent-msg-actions").length) {
							bubble_el.after(`
								<div class="agent-msg-actions">
									<button class="chat-action-btn copy-msg-btn" title="${__("Copy message")}">${self.get_copy_icon_svg()}</button>
								</div>
							`);
							row_el.data("raw-content", display_content);
							row_el.find(".copy-msg-btn").on("click", function (e) {
								e.stopPropagation();
								self.copy_message_content(row_el, $(this));
							});
						}

						self.scroll_to_bottom(msg_box);
						self.post_process_rendered_bubble(msg_box);
						self.render_mermaid_diagrams(msg_box);
						self.render_chartjs_diagrams(msg_box);
						resolve();
					}
				}

				let timerId = setTimeout(type, 30);
				this.typing_timers.push(timerId);
			});
		} else {
			let parsed_content = this.parse_markdown(display_content);

			// Edit is offered on the customer's own words only, and only when
			// there is plain text to hand back into the composer -- a message
			// that is only attachments has nothing for the textarea to hold.
			let is_own_message = sender === "user" || sender === "human";
			let can_edit = is_own_message && !attachments_html && content;
			let actions_html = `
				<div class="agent-msg-actions">
					<button class="chat-action-btn copy-msg-btn" title="${__("Copy message")}">${this.get_copy_icon_svg()}</button>
					${
						can_edit
							? `<button class="chat-action-btn edit-msg-btn" title="${__("Edit message")}">${this.get_edit_icon_svg()}</button>`
							: ""
					}
				</div>
			`;

			let bubble_html = `
				<div class="agent-msg-row ${sender}" data-message-id="${message_id || ""}">
					<div class="agent-msg-bubble">
						${attachments_html}
						${parsed_content ? `<div class="agent-msg-text-content">${parsed_content}</div>` : ""}
					</div>
					${actions_html}
					${
						formatted_time
							? `<div class="agent-msg-time" style="font-size: 10.5px; color: var(--chat-text-muted); margin-top: 2px; padding: 0 4px;">${formatted_time}</div>`
							: ""
					}
				</div>
			`;

			msg_box.append(bubble_html);
			let row = msg_box.find(".agent-msg-row").last();
			row.data("raw-content", content);
			let self = this;
			row.find(".copy-msg-btn").on("click", function (e) {
				e.stopPropagation();
				self.copy_message_content(row, $(this));
			});
			if (can_edit) {
				row.find(".edit-msg-btn").on("click", () => this.enter_edit_mode(row));
			}
			this.scroll_to_bottom(msg_box);
			this.post_process_rendered_bubble(msg_box);
			this.render_mermaid_diagrams(msg_box);
			this.render_chartjs_diagrams(msg_box);
			return Promise.resolve();
		}
	}

	// ─── Edit a previously sent message ─────────────────────────────────────
	//
	// Turns one user bubble into an inline textarea (Save/Cancel), in place of
	// the parsed content -- the same "click the pencil, the text becomes
	// editable right there" pattern as ChatGPT/Claude, rather than a modal.

	enter_edit_mode(row) {
		if (row.hasClass("editing")) return;
		row.addClass("editing");

		let bubble = row.find(".agent-msg-bubble");
		let text_el = bubble.find(".agent-msg-text-content");
		let raw_content = row.data("raw-content") || "";

		text_el.data("original-html", text_el.html()).hide();
		bubble.find(".agent-msg-actions").hide();

		let editor_html = `
			<div class="agent-msg-edit-box">
				<textarea class="agent-msg-edit-textarea">${frappe.utils.escape_html(raw_content)}</textarea>
				<div class="agent-msg-edit-controls">
					<button class="btn btn-xs btn-secondary agent-msg-edit-cancel">${__("Cancel")}</button>
					<button class="btn btn-xs btn-primary agent-msg-edit-save">${__("Save & Submit")}</button>
				</div>
			</div>
		`;
		bubble.append(editor_html);

		let textarea = bubble.find(".agent-msg-edit-textarea");
		textarea.focus();
		// Cursor at the end, not a full selection -- editing is usually a
		// small correction, not a rewrite from scratch.
		textarea[0].setSelectionRange(textarea.val().length, textarea.val().length);
		textarea
			.on("input", function () {
				this.style.height = "auto";
				this.style.height = `${this.scrollHeight}px`;
			})
			.trigger("input");

		let submit = () => {
			let new_text = textarea.val().trim();
			if (!new_text || new_text === raw_content) {
				this.exit_edit_mode(row);
				return;
			}
			this.chat.message_handler.submit_message_edit(row, new_text);
		};

		bubble.find(".agent-msg-edit-cancel").on("click", () => this.exit_edit_mode(row));
		bubble.find(".agent-msg-edit-save").on("click", submit);
		textarea.on("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				submit();
			} else if (e.key === "Escape") {
				this.exit_edit_mode(row);
			}
		});
	}

	exit_edit_mode(row) {
		let bubble = row.find(".agent-msg-bubble");
		bubble.find(".agent-msg-edit-box").remove();
		bubble.find(".agent-msg-text-content").show();
		bubble.find(".agent-msg-actions").show();
		row.removeClass("editing");
	}

	create_stream_bubble(msg_box, bubble_id, session_id) {
		this.hide_typing_indicator(msg_box);
		msg_box.find(".agent-welcome-state").remove();
		let bubble_html = `
			<div class="agent-msg-row ai" id="row-${bubble_id}" data-session-id="${session_id}">
				<div class="agent-msg-bubble streaming-active" id="${bubble_id}">
					<!-- Manager's live checklist -->
					<div class="agent-todo-wrapper" style="display: none;"></div>
					<!-- Collapsible Thinking Wrapper -->
					<div class="agent-thinking-wrapper" style="display: none;">
						<div class="thinking-header-toggle">
							<div class="thinking-header-left">
								<span class="thinking-header-icon" style="transform: rotate(90deg);"><i class="fa fa-chevron-right"></i></span>
								<span class="thinking-header-title">${__("Thinking...")}</span>
							</div>
							<span class="thinking-header-timer">0s</span>
						</div>
						<div class="thinking-body-content" style="display: block;">
							<div class="thinking-steps-list"></div>
							<div class="thinking-reasoning-block" style="display: none;"></div>
						</div>
					</div>
					<!-- Main Response Content -->
					<div class="agent-msg-text-content"></div>
				</div>
				<div class="agent-msg-time" style="font-size: 10.5px; color: var(--chat-text-muted); margin-top: 4px; padding: 0 4px; display: none;"></div>
			</div>
		`;
		msg_box.append(bubble_html);
		this.scroll_to_bottom(msg_box);

		// Accordion toggle click handler
		let row = msg_box.find(`#row-${bubble_id}`);
		row.find(".thinking-header-toggle").on("click", () => {
			let body = row.find(".thinking-body-content");
			let icon = row.find(".thinking-header-icon");
			if (body.is(":visible")) {
				body.slideUp(150);
				icon.css("transform", "rotate(0deg)");
			} else {
				body.slideDown(150);
				icon.css("transform", "rotate(90deg)");
			}
		});
	}

	// ─── Manager todo list ──────────────────────────────────────────────────
	//
	// The manager plans the customer's request as a checklist of tasks and
	// streams every status change as an `agent_todo_update` event. The panel is
	// redrawn WHOLE on each event — it is small, and a full redraw keeps this
	// code stateless about ordering. A completed task folds its result excerpt
	// behind a click, so the transcript stays one report from one voice.

	_todo_status_icon(status) {
		switch (status) {
			case "running":
				return '<i class="fa fa-cog fa-spin" style="color: var(--chat-primary);"></i>';
			case "done":
				return '<i class="fa fa-check-circle" style="color: #10a37f;"></i>';
			case "waiting":
				return '<i class="fa fa-question-circle" style="color: #f59e0b;"></i>';
			case "failed":
				return '<i class="fa fa-times-circle" style="color: #ef4444;"></i>';
			case "skipped":
				return '<i class="fa fa-minus-circle" style="color: var(--chat-text-muted);"></i>';
			default:
				return '<i class="fa fa-circle-o" style="color: var(--chat-text-muted);"></i>';
		}
	}

	_todo_kind_icon(task) {
		if (task.kind === "generate_document") return "fa-file-text-o";
		if (task.kind === "send_message") return "fa-paper-plane";
		let by_desk = {
			ask: "fa-comments",
			analyse: "fa-bar-chart",
			audit: "fa-shield",
			reconcile: "fa-balance-scale",
			create: "fa-pencil-square-o",
		};
		return by_desk[task.assignee] || "fa-tasks";
	}

	_todo_status_label(status) {
		switch (status) {
			case "running":
				return __("In progress");
			case "done":
				return __("Done");
			case "waiting":
				return __("Waiting for you");
			case "failed":
				return __("Failed");
			case "skipped":
				return __("Skipped");
			default:
				return __("Pending");
		}
	}

	_todo_panel_html(todo) {
		let tasks = (todo && todo.tasks) || [];
		if (!tasks.length) return "";

		let done_count = tasks.filter((t) => t.status === "done").length;
		let rows = tasks
			.map((task) => {
				let has_detail = task.status === "done" && task.detail;
				let detail_html = has_detail
					? `<div class="agent-todo-detail" style="display: none;">${this.parse_markdown(
							task.detail
					  )}</div>`
					: "";
				let caret = has_detail
					? '<i class="fa fa-chevron-down agent-todo-caret"></i>'
					: "";
				return `
				<div class="agent-todo-item status-${task.status} ${
					has_detail ? "has-detail" : ""
				}" data-task-id="${task.id}">
					<div class="agent-todo-item-row">
						<span class="agent-todo-status-icon">${this._todo_status_icon(task.status)}</span>
						<i class="fa ${this._todo_kind_icon(task)} agent-todo-kind-icon"></i>
						<span class="agent-todo-title">${frappe.utils.escape_html(task.title || "")}</span>
						<span class="agent-todo-status-label">${this._todo_status_label(task.status)}</span>
						${caret}
					</div>
					${detail_html}
				</div>
			`;
			})
			.join("");

		return `
			<div class="agent-todo-panel">
				<div class="agent-todo-header">
					<span class="agent-todo-header-title">
						<i class="fa fa-list-ul"></i> ${__("Task list")}
					</span>
					<span class="agent-todo-progress">${done_count}/${tasks.length}</span>
				</div>
				<div class="agent-todo-items">${rows}</div>
			</div>
		`;
	}

	_bind_todo_events($wrapper) {
		$wrapper.find(".agent-todo-item.has-detail .agent-todo-item-row").on("click", function () {
			let $item = $(this).closest(".agent-todo-item");
			let $detail = $item.find(".agent-todo-detail");
			let $caret = $item.find(".agent-todo-caret");
			if ($detail.is(":visible")) {
				$detail.slideUp(150);
				$caret.css("transform", "rotate(0deg)");
			} else {
				$detail.slideDown(150);
				$caret.css("transform", "rotate(180deg)");
			}
		});
	}

	// A run that has stopped for good: nothing left to watch.
	_todo_is_finished(todo) {
		return ["done", "partial", "failed", "cancelled"].includes((todo && todo.status) || "");
	}

	// The checklist belongs to the RUN, not to a chat bubble. One panel exists
	// at a time, it lives in the newest bubble, and it stays on screen while
	// the run is paused for a question or an approval — a customer answering
	// one must still see what is done and what is coming. It is removed the
	// moment the run ends or is cancelled, so a finished list can never sit in
	// the transcript still showing yesterday's steps as "Pending".
	clear_todo_panels(msg_box) {
		msg_box.find(".agent-todo-standalone").remove();
		msg_box.find(".agent-todo-wrapper").empty().hide();
	}

	render_todo_list(msg_box, bubble_id, todo) {
		if (this._todo_is_finished(todo)) {
			this.clear_todo_panels(msg_box);
			return;
		}

		let bubble_el = msg_box.find(`#${bubble_id}`);
		let wrapper = bubble_el.length ? bubble_el.find(".agent-todo-wrapper") : $();
		if (!wrapper.length) {
			// No live bubble to draw into (a resumed turn whose events arrived
			// first): the checklist is drawn into the transcript instead.
			this.render_todo_standalone(msg_box, todo);
			return;
		}

		let html = this._todo_panel_html(todo);
		if (!html) return;

		// Any earlier copy of this checklist — in a previous turn's bubble or
		// on its own row — is history now.
		msg_box.find(".agent-todo-standalone").remove();
		msg_box.find(".agent-todo-wrapper").not(wrapper).empty().hide();

		let was_near_bottom = this.is_near_bottom(msg_box);
		// Preserve which details the customer had open across the redraw.
		let open_ids = [];
		wrapper.find(".agent-todo-item").each(function () {
			if ($(this).find(".agent-todo-detail").is(":visible")) {
				open_ids.push($(this).attr("data-task-id"));
			}
		});

		wrapper.html(html).show();
		this._bind_todo_events(wrapper);
		open_ids.forEach((id) => {
			let $item = wrapper.find(`.agent-todo-item[data-task-id="${id}"]`);
			$item.find(".agent-todo-detail").show();
			$item.find(".agent-todo-caret").css("transform", "rotate(180deg)");
		});

		if (was_near_bottom) {
			this.force_scroll_to_bottom(msg_box);
		}
	}

	// The reload path: no live stream bubble exists, so the checklist is drawn
	// into the transcript directly.
	//
	// IT GOES WHERE IT ALWAYS GOES: FIRST, INSIDE THE NEWEST THING THE AGENT
	// SAID. That is where create_stream_bubble puts it while a run is live and
	// where render_plan_card keeps it when a plan lands, so a rebuilt page
	// must not put it somewhere else. Appending it as a row of its own at the
	// very end left the checklist UNDER the plan card it belongs to, so the
	// customer read the approval before the list of work it was part of.
	// A row of its own is the fallback for a transcript with nothing from the
	// agent in it yet.
	render_todo_standalone(msg_box, todo) {
		let html = this._todo_panel_html(todo);
		if (!html) return;
		this.clear_todo_panels(msg_box);

		let $bubble = msg_box.find(".agent-msg-row.ai").last().find(".agent-msg-bubble").first();
		if ($bubble.length) {
			let $wrapper = $bubble.find(".agent-todo-wrapper").first();
			if (!$wrapper.length) {
				$bubble.prepend('<div class="agent-todo-wrapper"></div>');
				$wrapper = $bubble.find(".agent-todo-wrapper").first();
			}
			$wrapper.html(html).show();
			this._bind_todo_events($wrapper);
			this.force_scroll_to_bottom(msg_box);
			return;
		}

		let $row = $(`
			<div class="agent-msg-row ai agent-todo-standalone">
				<div class="agent-msg-bubble" style="max-width: 100%;">
					<div class="agent-todo-wrapper">${html}</div>
				</div>
			</div>
		`);
		msg_box.append($row);
		this._bind_todo_events($row);
		this.force_scroll_to_bottom(msg_box);
	}

	update_stream_bubble(msg_box, bubble_id, content) {
		this.hide_typing_indicator(msg_box);
		this._schedule_draw(`${bubble_id}:answer`, () => {
			let bubble_el = msg_box.find(`#${bubble_id}`);
			if (!bubble_el.length) return;
			let text_el = bubble_el.find(".agent-msg-text-content");
			let msg_box_was_near_bottom = this.is_near_bottom(msg_box);
			text_el.html(this.parse_markdown(content));
			if (msg_box_was_near_bottom) {
				this.force_scroll_to_bottom(msg_box);
			}
		});
	}

	// `stream` is the whole active_streams entry (optional — callers that
	// still pass only 4 args get the old flat behaviour with no badge/plan/
	// nesting, so nothing on a slow-to-update caller breaks silently).
	update_stream_status(msg_box, bubble_id, status_text, steps = [], stream = null) {
		this.hide_typing_indicator(msg_box);
		this._schedule_draw(`${bubble_id}:steps`, () => {
			let bubble_el = msg_box.find(`#${bubble_id}`);
			if (!bubble_el.length) return;
			let steps_list = bubble_el.find(".thinking-steps-list");
			let msg_box_was_near_bottom = this.is_near_bottom(msg_box);
			steps_list.empty();

			if (steps && steps.length > 0) {
				steps.forEach((step, idx) => {
					let is_last = idx === steps.length - 1;
					let icon_class = is_last ? "fa-cog fa-spin" : "fa-check";
					let icon_color = is_last ? "var(--chat-primary)" : "#10a37f";
					let row_class = "thinking-step-item";
					// A tool call is a subtask OF the node running it, not a
					// sibling step — indent it under whichever node/agent
					// milestone most recently started.
					if (step.type === "tool") row_class += " nested";
					if (step.type === "agent") {
						row_class += " milestone";
						icon_class = is_last ? "fa-exchange fa-spin" : "fa-flag-checkered";
						icon_color = is_last ? "var(--chat-primary)" : "#10a37f";
					}
					let count_suffix =
						step.count && step.count > 1
							? ` <span class="thinking-step-count">(×${step.count})</span>`
							: "";
					steps_list.append(`
						<div class="${row_class}">
							<i class="fa ${icon_class}" style="color: ${icon_color}; font-size: 11px;"></i>
							<span>${step.name}${count_suffix}</span>
						</div>
					`);
				});
			} else if (status_text) {
				steps_list.append(`
					<div class="thinking-step-item">
						<i class="fa fa-cog fa-spin" style="color: var(--chat-primary); font-size: 11px;"></i>
						<span>${status_text}</span>
					</div>
				`);
			}

			// The badge: which desk is answering right now. Most worth
			// showing under 'auto', where the person never named a desk
			// themselves — without it, "auto" resolves invisibly.
			let badge_el = bubble_el.find(".thinking-agent-badge");
			if (stream && stream.current_agent) {
				let badge_html = `<span class="thinking-agent-badge agent-type-${this.safe_css_token(
					stream.current_agent
				)}">${this.chat.agent_display_name(stream.current_agent)}</span>`;
				if (badge_el.length) badge_el.replaceWith(badge_html);
				else bubble_el.find(".thinking-header-title").after(badge_html);
			}

			bubble_el.find(".agent-thinking-wrapper").show();
			if (msg_box_was_near_bottom) {
				this.force_scroll_to_bottom(msg_box);
			}
		});
	}

	update_stream_reasoning(msg_box, bubble_id, reasoning_text) {
		this.hide_typing_indicator(msg_box);
		this._schedule_draw(`${bubble_id}:reasoning`, () => {
			let bubble_el = msg_box.find(`#${bubble_id}`);
			if (!bubble_el.length) return;
			let reasoning_block = bubble_el.find(".thinking-reasoning-block");
			let body_content = bubble_el.find(".thinking-body-content");

			let msg_box_was_near_bottom = this.is_near_bottom(msg_box);
			let body_was_near_bottom = this.is_near_bottom(body_content);

			let parsed = this.parse_markdown(reasoning_text);
			reasoning_block.html(parsed).show();
			bubble_el.find(".agent-thinking-wrapper").show();

			if (body_was_near_bottom && body_content.length) {
				body_content.scrollTop(body_content[0].scrollHeight);
			}
			if (msg_box_was_near_bottom) {
				this.force_scroll_to_bottom(msg_box);
			}
		});
	}

	update_thinking_duration(msg_box, bubble_id, seconds) {
		let bubble_el = msg_box.find(`#${bubble_id}`);
		if (bubble_el.length) {
			bubble_el.find(".thinking-header-timer").text(`${seconds}s`);
		}
	}

	// `stream` is optional (see update_stream_status) — carries the resolved
	// desk for the final badge and the step count that decides whether this
	// breakdown is worth leaving open.
	finalize_stream_bubble(msg_box, bubble_id, content, datetime, header_title, stream = null) {
		this.hide_typing_indicator(msg_box);
		// The finished answer is the last word on this bubble: an unfinished
		// drawing still waiting for the next frame must not land on top of it.
		this._cancel_draws(bubble_id);
		let bubble_el = msg_box.find(`#${bubble_id}`);
		let row_el = msg_box.find(`#row-${bubble_id}`);
		if (bubble_el.length) {
			bubble_el.removeClass("streaming-active");

			// Turn all step icons to checkmarks
			let steps_list = bubble_el.find(".thinking-steps-list");
			steps_list
				.find(".thinking-step-item i, .thinking-step-item.milestone i")
				.removeClass("fa-cog fa-spin fa-exchange")
				.addClass("fa-check")
				.css("color", "#10a37f");

			if (header_title) {
				bubble_el.find(".thinking-header-title").text(header_title);
			}

			if (stream && stream.current_agent) {
				let badge_el = bubble_el.find(".thinking-agent-badge");
				let badge_html = `<span class="thinking-agent-badge agent-type-${this.safe_css_token(
					stream.current_agent
				)}">${this.chat.agent_display_name(stream.current_agent)}</span>`;
				if (badge_el.length) badge_el.replaceWith(badge_html);
				else bubble_el.find(".thinking-header-title").after(badge_html);
			}

			// A run with only one or two steps is a quick lookup; folding it
			// away is tidy. A run with a real breakdown — several nodes, a
			// tool called more than once, a desk hand-off — is the exact case
			// "subtasks for a big task" exists to show, and it is the one
			// moment that breakdown is complete. Auto-collapsing it away on
			// the instant it finishes hid the answer to "what did it just do"
			// right when that question was easiest to ask.
			let step_count = stream && stream.steps ? stream.steps.length : 0;
			let body = bubble_el.find(".thinking-body-content");
			let icon = bubble_el.find(".thinking-header-icon");
			if (step_count > 2) {
				body.slideDown(150);
				icon.css("transform", "rotate(90deg)");
			} else {
				body.slideUp(150);
				icon.css("transform", "rotate(0deg)");
			}

			let is_plan = false;
			let parsed_data = null;
			if (content) {
				if (typeof content === "object") {
					if (content.type === "plan") {
						is_plan = true;
						parsed_data = content;
					}
				} else if (typeof content === "string") {
					let trimmed = content.trim();
					if (
						trimmed.startsWith("{") &&
						(trimmed.includes('"type": "plan"') || trimmed.includes('"type":"plan"'))
					) {
						try {
							let parsed = JSON.parse(trimmed);
							if (parsed && parsed.type === "plan") {
								is_plan = true;
								parsed_data = parsed;
							}
						} catch (e) {
							// Not valid JSON -- not a plan, render as plain text below.
						}
					}
				}
			}

			if (is_plan) {
				bubble_el.css({
					background: "transparent",
					border: "none",
					padding: "0",
					"box-shadow": "none",
					"max-width": "100%",
				});
				this.render_plan_card(bubble_el, parsed_data, datetime);
				bubble_el.find(".agent-thinking-wrapper").hide();
			} else {
				// A GENERATED FILE IS A CHIP THEY CAN OPEN, NOT A PATH THEY READ.
				//
				// This is the LIVE ending of a run; append_message is the same
				// message after a reload. Only that one ever rendered the
				// [FILE:name:url] marker, so a customer watching their file being
				// produced was shown "/private/files/report3668e6.pdf" as plain
				// text — nothing to click, and no way to open the file they had
				// just asked for until they reloaded the page.
				let display_content = content;
				let attachments_html = "";
				if (
					typeof content === "string" &&
					this.chat.attachments_renderer &&
					this.chat.attachments_renderer.has_attachments(content)
				) {
					let attached = this.chat.attachments_renderer.parse_and_render(content);
					display_content = attached.text;
					attachments_html = attached.attachments_html;
				}

				let text_el = bubble_el.find(".agent-msg-text-content");
				text_el.html(this.parse_markdown(display_content));
				// Finalising twice must not stack two copies of the same chip.
				bubble_el.find(".agent-chat-attachments").remove();
				if (attachments_html) {
					text_el.before(attachments_html);
				}

				// Attach copy button fixed under finalized stream message
				if (!row_el.find(".agent-msg-actions").length) {
					bubble_el.after(`
						<div class="agent-msg-actions">
							<button class="chat-action-btn copy-msg-btn" title="${__("Copy message")}">${this.get_copy_icon_svg()}</button>
						</div>
					`);
				}
				let self = this;
				row_el.data("raw-content", content);
				row_el.find(".copy-msg-btn").off("click").on("click", function (e) {
					e.stopPropagation();
					self.copy_message_content(row_el, $(this));
				});
			}

			if (datetime) {
				let formatted_time = this.format_time(datetime);
				let time_el = row_el.find(".agent-msg-time");
				if (time_el.length) {
					time_el.text(formatted_time).fadeIn(300);
				}
			}

			this.force_scroll_to_bottom(msg_box);
			this.post_process_rendered_bubble(msg_box);
			this.render_mermaid_diagrams(msg_box);
			this.render_chartjs_diagrams(msg_box);
		}
	}

	show_typing_indicator(msg_box) {
		this.hide_typing_indicator(msg_box);
		let indicator_html = `
			<div class="agent-msg-row ai" id="agent-typing-row">
				<div class="agent-msg-bubble">
					<div class="agent-typing-indicator">
						<div class="agent-typing-dot"></div>
						<div class="agent-typing-dot"></div>
						<div class="agent-typing-dot"></div>
					</div>
				</div>
			</div>
		`;
		msg_box.append(indicator_html);
		this.force_scroll_to_bottom(msg_box);
	}

	hide_typing_indicator(msg_box) {
		msg_box.find("#agent-typing-row").remove();
	}

	/** Show how far the reading of this message's documents has got.
	 *
	 * WHY THERE IS A BAR AT ALL. Reading a ten-page scan takes half a minute,
	 * and half a minute of three bouncing dots is indistinguishable from a
	 * product that has stopped working. A bar that moves is the difference
	 * between "it is working" and "it is broken", and it costs one line from
	 * the worker per page.
	 *
	 * It sits where the answer will be, inside the same bubble as the dots, so
	 * the chat does not jump when the reading finishes and the answer starts.
	 */
	show_reading_progress(msg_box, report) {
		if (!msg_box || !msg_box.length) return;

		let $row = msg_box.find("#agent-typing-row");
		if (!$row.length) {
			this.show_typing_indicator(msg_box);
			$row = msg_box.find("#agent-typing-row");
		}

		let $bubble = $row.find(".agent-msg-bubble");
		let $bar = $bubble.find(".agent-reading");
		if (!$bar.length) {
			$bubble.prepend(`
				<div class="agent-reading">
					<div class="agent-reading-line">
						<span class="agent-reading-what"></span>
						<span class="agent-reading-count"></span>
					</div>
					<div class="agent-reading-track"><div class="agent-reading-fill"></div></div>
				</div>
			`);
			$bar = $bubble.find(".agent-reading");
		}

		let files = Math.max(report.files || 1, 1);
		let pages = Math.max(report.pages || 1, 1);
		let page = Math.min(Math.max(report.page || 0, 0), pages);
		let position = Math.min(Math.max(report.file || 1, 1), files);
		// Whole files already behind us, plus how far into this one we are.
		let done = (position - 1 + page / pages) / files;

		// The name on the left, where it can be shortened without losing its
		// beginning; the counting on the right, where it must never be cut.
		let counted = [];
		if (pages > 1) counted.push(__("page {0} of {1}", [Math.max(page, 1), pages]));
		if (files > 1) counted.push(__("file {0} of {1}", [position, files]));

		$bar.find(".agent-reading-what").text(__("Reading {0}", [report.filename || ""]));
		$bar.find(".agent-reading-count").text(counted.join(" · "));
		$bar.find(".agent-reading-fill").css("width", Math.round(done * 100) + "%");
		this.scroll_to_bottom(msg_box);
	}

	hide_reading_progress(msg_box) {
		if (!msg_box || !msg_box.length) return;
		msg_box.find(".agent-reading").remove();
	}

	is_near_bottom(el, threshold = 60) {
		if (!el || !el.length || !el[0]) return false;
		let dom_el = el[0];
		return dom_el.scrollHeight - dom_el.scrollTop - dom_el.clientHeight <= threshold;
	}

	//: Binds a real 'scroll' listener the first time this msg_box is seen
	//: (guarded by a data flag, so every call site can call this freely).
	//:
	//: WHY A PROXIMITY CHECK ALONE WAS NOT ENOUGH
	//:     `scroll_to_bottom`/`force_scroll_to_bottom` used to decide whether
	//:     to snap down by re-measuring `is_near_bottom` at the moment each
	//:     stream chunk arrived — which is nearly every 30ms while a reply is
	//:     typing out. A user scrolling up mid-reply is still, for most of
	//:     that gesture, within the old 60-100px threshold, so the very next
	//:     chunk read them as "still near the bottom" and snapped the view
	//:     back before their scroll had a chance to carry them further —
	//:     reported live as "it doesn't let me scroll while it's answering".
	//:     A real 'scroll' event, tracked once and trusted until the NEXT
	//:     real scroll event, does not get re-decided by unrelated content
	//:     changes: once the user's own gesture has taken them away from the
	//:     bottom, auto-follow stays off until they scroll back themselves or
	//:     press "New messages" — regardless of how many chunks arrive
	//:     between now and then.
	_ensure_scroll_tracking(msg_box) {
		if (!msg_box || !msg_box.length || msg_box.data("razyynScrollTrackingBound")) return;
		msg_box.data("razyynScrollTrackingBound", true);
		msg_box.on("scroll", () => {
			this.user_pinned_to_bottom = this.is_near_bottom(msg_box, 20);
			this._toggle_scroll_to_bottom_btn(!this.user_pinned_to_bottom);
		});
	}

	_toggle_scroll_to_bottom_btn(show) {
		let btn = this.chat && this.chat.layout && this.chat.layout.find("#agent-scroll-to-bottom");
		if (btn && btn.length) btn.toggleClass("visible", !!show);
	}

	scroll_to_bottom(msg_box) {
		if (!msg_box || !msg_box[0]) return;
		this._ensure_scroll_tracking(msg_box);
		if (this.user_pinned_to_bottom === false) return;
		msg_box.scrollTop(msg_box[0].scrollHeight);
	}

	force_scroll_to_bottom(msg_box) {
		if (!msg_box || !msg_box[0]) return;
		this._ensure_scroll_tracking(msg_box);
		if (this.user_pinned_to_bottom === false) return;
		msg_box.scrollTop(msg_box[0].scrollHeight);
	}

	//: The "New messages" button's own handler, and the only other way (with
	//: scrolling to the bottom by hand) that auto-follow turns back on.
	jump_to_bottom(msg_box) {
		if (!msg_box || !msg_box[0]) return;
		msg_box.scrollTop(msg_box[0].scrollHeight);
		this.user_pinned_to_bottom = true;
		this._toggle_scroll_to_bottom_btn(false);
	}

	render_mermaid_diagrams(container) {
		if (typeof mermaid === "undefined") return;
		try {
			mermaid.initialize(this.get_mermaid_config());
		} catch (err) {
			console.error("Mermaid initialization error:", err);
		}
		let self = this;
		container.find('.mermaid-container[data-processed="false"]').each(function () {
			let $this = $(this);
			let code = decodeURIComponent($this.attr("data-code"));

			// Remove Mermaid comment lines (starting with %%) and strip trailing whitespace/newlines
			let clean_code = code.replace(/%%.*$/gm, "").trim();

			if (!clean_code) {
				$this.attr("data-processed", "true");
				$this.hide();
				return;
			}

			// Sanitize transition labels inside |label| to prevent parentheses and brackets from breaking Mermaid parser
			code = code.replace(/\|([^|\n\r]+)\|/g, function (match, label) {
				let trimmed = label.trim();
				if (
					(trimmed.includes("(") ||
						trimmed.includes(")") ||
						trimmed.includes("[") ||
						trimmed.includes("]") ||
						trimmed.includes("{") ||
						trimmed.includes("}")) &&
					!(trimmed.startsWith('"') && trimmed.endsWith('"'))
				) {
					return `|"${trimmed.replace(/"/g, '\\"')}"|`;
				}
				return match;
			});

			// Sanitize unquoted node labels to prevent syntax errors on special characters/spaces
			// 1. Double brackets: A[[label]] -> A[["label"]]
			code = code.replace(/\b([a-zA-Z0-9_-]+)\[\[([^"\]\n\r]+)\]\]/g, '$1[["$2"]]');
			// 2. Double parentheses: A((label)) -> A(("label"))
			code = code.replace(/\b([a-zA-Z0-9_-]+)\(\(([^"\)\n\r]+)\)\)/g, '$1(("$2"))');
			// 3. Stadium: A([label]) -> A(["label"])
			code = code.replace(/\b([a-zA-Z0-9_-]+)\(\[([^"\]\n\r]+)\]\)/g, '$1(["$2"])');
			// 4. Cylinder: A[(label)] -> A([\"label\"])
			code = code.replace(/\b([a-zA-Z0-9_-]+)\[\(([^"\)\n\r]+)\)\]/g, '$1[("$2")]');
			// 5. Rectangular: A[label] -> A["label"]
			code = code.replace(/\b([a-zA-Z0-9_-]+)\[([^"\]\n\r]+)\]/g, '$1["$2"]');
			// 6. Round: A(label) -> A("label")
			code = code.replace(/\b([a-zA-Z0-9_-]+)\(([^"\)\n\r]+)\)/g, '$1("$2")');
			// 7. Curly: A{label} -> A{"label"}
			code = code.replace(/\b([a-zA-Z0-9_-]+)\{([^"\}\n\r]+)\}/g, '$1{"$2"}');
			// 8. Asymmetric: A>label] -> A>"label"]
			code = code.replace(/\b([a-zA-Z0-9_-]+)\>([^"\]\n\r]+)\]/g, '$1>"$2"]');

			$this.attr("data-processed", "true");
			let id = "mermaid-" + self.chat.generate_uuid();
			try {
				mermaid
					.render(id, code)
					.then(({ svg }) => {
						$this.html(svg);
						self.scroll_to_bottom(container);
					})
					.catch((err) => {
						console.error("Mermaid render error:", err);
						$this.html(
							`<pre style="color: var(--chat-cancel, #e11d48); background-color: var(--ai-bubble); padding: 10px; border-radius: 6px; font-size: 11px;">Error rendering chart: ${
								err.message || err
							}</pre>`
						);
						$("#d" + id).remove();
					});
			} catch (e) {
				console.error("Mermaid exception:", e);
				$this.html(
					`<pre style="color: var(--chat-cancel, #e11d48); background-color: var(--ai-bubble); padding: 10px; border-radius: 6px; font-size: 11px;">Error rendering chart: ${
						e.message || e
					}</pre>`
				);
			}
		});
	}

	render_chartjs_diagrams(container) {
		let self = this;
		if (typeof Chart === "undefined") {
			// Poll CDN download every 100ms until loaded
			setTimeout(() => self.render_chartjs_diagrams(container), 100);
			return;
		}

		container.find('.chartjs-container[data-processed="false"]').each(function () {
			let $this = $(this);
			let code = decodeURIComponent($this.attr("data-code"));

			// Defensive formatting cleanup
			let cleanCode = code.trim();
			cleanCode = cleanCode.replace(/,\s*([\]}])/g, "$1"); // Clean trailing commas
			cleanCode = cleanCode.replace(/^```json\s*/i, "").replace(/```$/, "");

			$this.attr("data-processed", "true");

			try {
				let chartConfig = JSON.parse(cleanCode);

				if (!chartConfig.type) chartConfig.type = "bar";
				if (!chartConfig.data) chartConfig.data = { labels: [], datasets: [] };
				if (!chartConfig.data.datasets) chartConfig.data.datasets = [];

				// Palette definition
				const palette = [
					"#10a37f", // Emerald Green
					"#3b82f6", // Ocean Blue
					"#f59e0b", // Amber Yellow
					"#8b5cf6", // Indigo
					"#ec4899", // Pink
					"#ef4444", // Red
					"#06b6d4", // Cyan
					"#14b8a6", // Teal
				];
				const hoverPalette = [
					"#0d8a6a",
					"#2563eb",
					"#d97706",
					"#7c3aed",
					"#db2777",
					"#dc2626",
					"#0891b2",
					"#0d9488",
				];

				// Intercept & Auto-Theme Datasets
				chartConfig.data.datasets.forEach((dataset, idx) => {
					if (["pie", "doughnut", "polarArea"].includes(chartConfig.type)) {
						const dataLen = dataset.data ? dataset.data.length : 0;
						dataset.backgroundColor = palette.slice(0, dataLen);
						dataset.hoverBackgroundColor = hoverPalette.slice(0, dataLen);
						dataset.borderColor = "#ffffff";
						dataset.borderWidth = 2;
					} else {
						const color = palette[idx % palette.length];
						const hoverColor = hoverPalette[idx % hoverPalette.length];
						dataset.backgroundColor = color;
						dataset.borderColor = color;

						if (["line", "radar"].includes(chartConfig.type)) {
							dataset.fill = dataset.fill || false;
							dataset.tension = 0.3;
							dataset.backgroundColor = color + "22";
							dataset.pointBackgroundColor = color;
							dataset.pointBorderColor = "#ffffff";
							dataset.pointHoverBackgroundColor = "#ffffff";
							dataset.pointHoverBorderColor = color;
						} else if (chartConfig.type === "bar") {
							dataset.hoverBackgroundColor = hoverColor;
							dataset.borderRadius = 6;
						}
					}
				});

				// Auto Merge Responsive Configuration Options
				const defaultOptions = {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: true,
							position: "bottom",
							labels: {
								boxWidth: 12,
								usePointStyle: true,
								font: {
									family: "Inter, sans-serif",
									size: 11,
								},
								color: "#4b5563",
							},
						},
					},
				};
				chartConfig.options = $.extend(
					true,
					{},
					defaultOptions,
					chartConfig.options || {}
				);

				// Safely destroy existing chart instance on reuse
				let canvasEl = $this.find("canvas")[0];
				if (canvasEl) {
					const existingChart = Chart.getChart(canvasEl);
					if (existingChart) {
						existingChart.destroy();
					}
				}

				// Build canvas and mount chart instance
				$this
					.empty()
					.html(
						'<canvas style="width:100% !important; height:100% !important;"></canvas>'
					);
				canvasEl = $this.find("canvas")[0];
				new Chart(canvasEl, chartConfig);
				self.scroll_to_bottom(container);
			} catch (err) {
				console.error("Chart.js render error:", err);
				$this.html(
					`<pre style="color: var(--chat-cancel, #e11d48); background-color: var(--ai-bubble); padding: 10px; border-radius: 6px; font-size: 11px;">Error parsing chart data: ${
						err.message || err
					}</pre>`
				);
			}
		});
	}

	// Every path out of this function passes through here. marked.js (and the
	// raw-HTML fallback below it) can both be made to emit a <script>, an
	// onerror=, or a javascript: URL from LLM-authored or attacker-supplied
	// text, so nothing leaves this function without going through DOMPurify
	// first. If DOMPurify has not finished loading yet, the marked branch is
	// skipped entirely in favour of the escaped fallback rather than ever
	// emitting marked's raw, unsanitized HTML.
	sanitize_html(html) {
		if (window.DOMPurify) {
			return window.DOMPurify.sanitize(html);
		}
		return html;
	}

	// `stream.current_agent`/`data.agent` is meant to be a short desk key
	// ("ask", "analyse", ...), but it arrives over the realtime channel as a
	// plain string, and it gets interpolated raw into a `class="agent-type-…"`
	// attribute in two places below. A value containing a quote would break
	// out of the attribute; restricting it to the character set an actual
	// desk key uses closes that off without needing a full HTML-attribute
	// escaper for a value that should never need one.
	safe_css_token(value) {
		return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
	}

	parse_markdown(text) {
		if (!text) return "";

		if (window.marked && window.DOMPurify) {
			try {
				return this.sanitize_html(window.marked.parse(text));
			} catch (err) {
				console.error("Marked parsing error:", err);
			}
		}

		// Fallback: Crude basic parsing (original logic)
		let output = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

		// A FOLDED QUESTION MUST STILL FOLD WITH NO MARKDOWN LIBRARY.
		//
		// marked.js is fetched from a CDN, so this branch runs whenever that
		// fetch failed — offline, blocked, or a slow first paint. Everything
		// is escaped above, which is right for every tag except the two that
		// carry a stored question: without this the customer reads a literal
		// "<details>" in their chat instead of a heading they can open.
		//
		// Restored by exact match, so no attribute and no other tag can ride
		// in with them. The span is the carrier for a question that had
		// nothing to fold — invisible, and it must stay invisible here too:
		// left escaped, the customer reads a tag where their question should
		// be, which is the exact complaint this whole path exists to answer.
		output = output
			.replace(
				/&lt;span class="agent-question-data" data-questions="([A-Za-z0-9+/=]*)"&gt;&lt;\/span&gt;/g,
				'<span class="agent-question-data" data-questions="$1"></span>'
			)
			// The settled fold carries `data-answered`, which is how the picker
			// below tells an open question from a finished exchange. Matched
			// before the plain one so the flag is not stripped off it.
			.replace(
				/&lt;details class="agent-question" data-questions="([A-Za-z0-9+/=]*)" data-answered="1"&gt;/g,
				'<details class="agent-question" data-questions="$1" data-answered="1">'
			)
			.replace(
				/&lt;details class="agent-question" data-questions="([A-Za-z0-9+/=]*)"&gt;/g,
				'<details class="agent-question" data-questions="$1">'
			)
			.replace(/&lt;details class="agent-question"&gt;/g, '<details class="agent-question">')
			// WHAT THEY ANSWERED, inside the question that asked it. The class is
			// what the renderer and the server both match on; the label inside it
			// is translated and neither of them reads it.
			.replace(/&lt;span class="agent-answer"&gt;/g, '<span class="agent-answer">')
			.replace(/&lt;\/span&gt;/g, "</span>")
			.replace(/&lt;\/details&gt;/g, "</details>")
			.replace(/&lt;summary&gt;/g, "<summary>")
			.replace(/&lt;\/summary&gt;/g, "</summary>");

		let lines = output.split("\n");
		let in_table = false;
		let table_html = "";
		let updated_lines = [];

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].trim();
			if (line.startsWith("|") && line.endsWith("|")) {
				if (!in_table) {
					in_table = true;
					table_html = "<table><thead>";
					let headers = line
						.split("|")
						.map((x) => x.trim())
						.filter((x, index, arr) => index > 0 && index < arr.length - 1);
					table_html +=
						"<tr>" +
						headers.map((h) => `<th>${h}</th>`).join("") +
						"</tr></thead><tbody>";
				} else if (line.includes("---") || line.includes("-:-")) {
					continue;
				} else {
					let cells = line
						.split("|")
						.map((x) => x.trim())
						.filter((x, index, arr) => index > 0 && index < arr.length - 1);
					table_html += "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
				}
			} else {
				if (in_table) {
					table_html += "</tbody></table>";
					updated_lines.push(table_html);
					in_table = false;
					table_html = "";
				}
				updated_lines.push(line);
			}
		}

		if (in_table) {
			table_html += "</tbody></table>";
			updated_lines.push(table_html);
		}

		output = updated_lines.join("<br>");
		let temp_output = output;

		let code_block_count = (temp_output.match(/```/g) || []).length;
		if (code_block_count % 2 !== 0) temp_output += "\n```";

		let bold_count = (temp_output.match(/\*\*/g) || []).length;
		if (bold_count % 2 !== 0) temp_output += "**";

		temp_output = temp_output.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

		// Parse Mermaid diagrams first
		temp_output = temp_output.replace(
			/```mermaid\s*(?:<br>)?([\s\S]*?)(?:<br>)?```/gi,
			function (match, code) {
				let raw_code = code.replace(/<br\s*\/?>/gi, "\n");
				raw_code = raw_code
					.replace(/&amp;/g, "&")
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&quot;/g, '"');
				let escaped_code = encodeURIComponent(raw_code.trim());
				return `<div class="mermaid-container" data-processed="false" data-code="${escaped_code}"></div>`;
			}
		);

		// Parse Chart.js diagrams
		temp_output = temp_output.replace(
			/```chartjs\s*(?:<br>)?([\s\S]*?)(?:<br>)?```/gi,
			function (match, code) {
				let raw_code = code.replace(/<br\s*\/?>/gi, "\n");
				raw_code = raw_code
					.replace(/&amp;/g, "&")
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&quot;/g, '"');
				let escaped_code = encodeURIComponent(raw_code.trim());
				return `<div class="chartjs-container" data-processed="false" data-code="${escaped_code}"></div>`;
			}
		);

		temp_output = temp_output.replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>");
		temp_output = temp_output.replace(/`(.*?)`/g, "<code>$1</code>");

		return this.sanitize_html(temp_output);
	}

	post_process_rendered_bubble(container) {
		let self = this;

		// Wrap tables in responsive container, attach export toolbar, and align numeric columns
		container.find("table").each(function () {
			let table = $(this);

			// Avoid double-processing tables that already have an export toolbar
			let existing_wrapper = table.closest(".agent-table-wrapper");
			if (existing_wrapper.length && existing_wrapper.find(".agent-table-toolbar").length) {
				return;
			}

			if (!table.parent().hasClass("agent-table-scroll-container")) {
				if (existing_wrapper.length) {
					table.wrap('<div class="agent-table-scroll-container"></div>');
				} else {
					table.wrap('<div class="agent-table-wrapper"><div class="agent-table-scroll-container"></div></div>');
				}
			}

			let wrapper = table.closest(".agent-table-wrapper");

			// Detect numeric columns dynamically
			let first_row = table.find("tr:first");
			let row_count = 0;
			if (first_row.length) {
				let col_count = first_row.find("th, td").length;
				let is_numeric_col = new Array(col_count).fill(true);

				let rows = table.find("tbody tr");
				if (rows.length === 0) {
					rows = table.find("tr").slice(1); // skip first row
				}
				row_count = rows.length;

				rows.each(function () {
					$(this)
						.find("td")
						.each(function (i) {
							let text = $(this)
								.text()
								.trim()
								.replace(/[\$,€,£,¥]/g, "")
								.trim();
							if (text && !/^-?[\d,\.\s%]+$/.test(text)) {
								is_numeric_col[i] = false;
							}
						});
				});

				// Apply right alignment and numeric classes
				table.find("tr").each(function () {
					$(this)
						.find("th, td")
						.each(function (i) {
							if (is_numeric_col[i]) {
								$(this).css("text-align", "right");
								$(this).addClass("font-numeric");
							}
						});
				});
			}

			// Style total / balance rows
			table.find("tr").each(function () {
				let row = $(this);
				let row_text = row.text().toLowerCase();
				if (
					row_text.includes("total") ||
					row_text.includes("balance") ||
					row_text.includes("reconciliation difference")
				) {
					row.addClass("table-total-row");
				}
			});

			// Attach Table Export Toolbar if not present
			if (!wrapper.find(".agent-table-toolbar").length) {
				let toolbar_html = `
					<div class="agent-table-toolbar">
						<div class="agent-table-toolbar-left">
							<span class="agent-table-tag"><i class="fa fa-table"></i> ${__("Data Table")}</span>
							<span class="agent-table-row-count">${row_count} ${row_count === 1 ? __("row") : __("rows")}</span>
						</div>
						<div class="agent-table-toolbar-right">
							<button class="agent-table-action-btn btn-table-excel" title="${__("Export to Excel (.xlsx)")}">
								<i class="fa fa-file-excel-o"></i> <span>Excel</span>
							</button>
							<button class="agent-table-action-btn btn-table-pdf" title="${__("Export to PDF (.pdf)")}">
								<i class="fa fa-file-pdf-o"></i> <span>PDF</span>
							</button>
							<button class="agent-table-action-btn btn-table-csv" title="${__("Export to CSV (.csv)")}">
								<i class="fa fa-file-text-o"></i> <span>CSV</span>
							</button>
							<button class="agent-table-action-btn btn-table-copy" title="${__("Copy Table to Clipboard")}">
								<i class="fa fa-clipboard"></i> <span>${__("Copy")}</span>
							</button>
						</div>
					</div>
				`;
				wrapper.prepend(toolbar_html);

				let filename_base = "Razyyn_Table_" + self.get_timestamp_slug();

				wrapper.find(".btn-table-excel").on("click", function (e) {
					e.preventDefault();
					self.export_table_to_excel(table, filename_base, $(this));
				});

				wrapper.find(".btn-table-pdf").on("click", function (e) {
					e.preventDefault();
					self.export_table_to_pdf(table, filename_base, $(this));
				});

				wrapper.find(".btn-table-csv").on("click", function (e) {
					e.preventDefault();
					self.export_table_to_csv(table, filename_base);
				});

				wrapper.find(".btn-table-copy").on("click", function (e) {
					e.preventDefault();
					self.copy_table_to_clipboard(table, $(this));
				});
			}
		});
	}

	get_timestamp_slug() {
		let now = new Date();
		let pad = (n) => String(n).padStart(2, "0");
		let y = now.getFullYear();
		let m = pad(now.getMonth() + 1);
		let d = pad(now.getDate());
		let hr = pad(now.getHours());
		let mn = pad(now.getMinutes());
		let sc = pad(now.getSeconds());
		return `${y}${m}${d}_${hr}${mn}${sc}`;
	}

	/**
	 * Extracts headers, rows and cell data from an HTML table element.
	 */
	extract_table_data(table_el) {
		let headers = [];
		let rows = [];
		let alignments = [];

		let $table = $(table_el);
		let $header_cells = $table.find("thead th, thead td");
		if (!$header_cells.length) {
			$header_cells = $table.find("tr:first th, tr:first td");
		}

		$header_cells.each(function () {
			headers.push($(this).text().trim());
			alignments.push($(this).css("text-align") || "left");
		});

		let $body_rows = $table.find("tbody tr");
		if (!$body_rows.length) {
			$body_rows = $table.find("tr").slice(1);
		}

		$body_rows.each(function () {
			let row_data = [];
			$(this).find("td, th").each(function () {
				let val = $(this).text().trim();
				row_data.push(val);
			});
			if (row_data.length) {
				rows.push(row_data);
			}
		});

		return { headers, rows, alignments };
	}

	/**
	 * Sanitizes cell contents to prevent CSV / Formula Injection (CWE-1236).
	 * If a string begins with =, +, -, @, \t, or \r and is not a plain number,
	 * it is prefixed with a single quote (') so spreadsheet engines treat it as text.
	 */
	sanitize_cell_for_export(val, format = "csv") {
		if (val === null || val === undefined) return "";
		let str = String(val).trim();
		if (!str) return "";

		// Check if it's a safe numeric value (e.g., "123", "-45.67", "1,250.00", "+50%")
		let clean_num_str = str.replace(/[$,€,£,¥,\s]/g, "").replace(/,/g, "");
		if (/^[+-]?\d+(\.\d+)?%?$/.test(clean_num_str)) {
			return str;
		}

		// If string starts with risky formula trigger characters: =, +, -, @, \t, \r
		if (/^[=+\-@\t\r]/.test(str)) {
			return "'" + str;
		}
		return str;
	}

	/**
	 * Sequentially attempts to load a script from multiple sources (local asset first, then CDNs).
	 */
	_load_script_with_fallbacks(sources) {
		return new Promise((resolve, reject) => {
			let index = 0;
			let try_next = () => {
				if (index >= sources.length) {
					reject(new Error(__("Failed to load script from all available sources")));
					return;
				}
				let src = sources[index++];
				let script = document.createElement("script");
				script.src = src;
				script.crossOrigin = "anonymous";
				script.onload = () => resolve();
				script.onerror = () => {
					script.remove();
					try_next();
				};
				document.head.appendChild(script);
			};
			try_next();
		});
	}

	/**
	 * Lazy-loads SheetJS (xlsx.full.min.js) on demand (local bundle first, CDN fallback).
	 */
	load_xlsx_library() {
		if (window.XLSX) {
			return Promise.resolve(window.XLSX);
		}
		if (this._xlsx_loading_promise) {
			return this._xlsx_loading_promise;
		}
		let sources = [
			"/assets/accountant_agent/js/xlsx.full.min.js",
			"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
			"https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
			"https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
		];
		this._xlsx_loading_promise = this._load_script_with_fallbacks(sources)
			.then(() => {
				if (window.XLSX) return window.XLSX;
				throw new Error(__("Excel library loaded but XLSX object is undefined"));
			})
			.catch((err) => {
				this._xlsx_loading_promise = null; // allow retry on next attempt
				throw err;
			});
		return this._xlsx_loading_promise;
	}

	/**
	 * Lazy-loads jsPDF and jsPDF-AutoTable on demand (local bundle first, CDN fallback).
	 */
	load_pdf_libraries() {
		if (
			window.jspdf &&
			window.jspdf.jsPDF &&
			(typeof window.jspdf.jsPDF.prototype.autoTable === "function" ||
				typeof window.jspdf.autoTable === "function")
		) {
			return Promise.resolve(window.jspdf);
		}
		if (this._pdf_loading_promise) {
			return this._pdf_loading_promise;
		}
		let jspdf_sources = [
			"/assets/accountant_agent/js/jspdf.umd.min.js",
			"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
			"https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
		];
		let autotable_sources = [
			"/assets/accountant_agent/js/jspdf.plugin.autotable.min.js",
			"https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
			"https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
		];
		this._pdf_loading_promise = this._load_script_with_fallbacks(jspdf_sources)
			.then(() => this._load_script_with_fallbacks(autotable_sources))
			.then(() => {
				if (window.jspdf) return window.jspdf;
				throw new Error(__("PDF library loaded but jsPDF object is undefined"));
			})
			.catch((err) => {
				this._pdf_loading_promise = null; // allow retry on next attempt
				throw err;
			});
		return this._pdf_loading_promise;
	}

	/**
	 * Exports an HTML table to genuine Excel (.xlsx) format.
	 */
	async export_table_to_excel(table_el, filename, $btn) {
		let { headers, rows } = this.extract_table_data(table_el);
		if (!headers.length && !rows.length) {
			frappe.show_alert({ message: __("Table contains no data to export"), indicator: "orange" }, 3);
			return;
		}

		let original_html = $btn ? $btn.html() : "";
		if ($btn) {
			$btn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> <span>Excel...</span>');
		}

		try {
			let XLSX = await this.load_xlsx_library();

			let ws_data = [];
			if (headers.length) {
				ws_data.push(headers.map((h) => this.sanitize_cell_for_export(h, "excel")));
			}
			rows.forEach((row) => {
				ws_data.push(
					row.map((cell) => {
						let safe_val = this.sanitize_cell_for_export(cell, "excel");
						let clean_num = cell.replace(/[$,€,£,¥,\s]/g, "").replace(/,/g, "");
						if (clean_num !== "" && /^-?\d+(\.\d+)?$/.test(clean_num)) {
							let num = parseFloat(clean_num);
							if (!isNaN(num)) return num;
						}
						return safe_val;
					})
				);
			});

			let ws = XLSX.utils.aoa_to_sheet(ws_data);

			// Auto calculate column widths
			let col_widths = [];
			ws_data.forEach((row) => {
				row.forEach((cell, idx) => {
					let len = cell !== null && cell !== undefined ? String(cell).length : 10;
					col_widths[idx] = Math.max(col_widths[idx] || 10, Math.min(len + 3, 50));
				});
			});
			ws["!cols"] = col_widths.map((w) => ({ wch: w }));

			let wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "Financial Data");
			XLSX.writeFile(wb, (filename || "Razyyn_Financial_Table") + ".xlsx");
			frappe.show_alert({ message: __("Excel file downloaded successfully"), indicator: "green" }, 3);
		} catch (err) {
			console.error("Excel export error:", err);
			frappe.show_alert(
				{ message: __("Failed to generate Excel file: {0}", [err.message]), indicator: "red" },
				4
			);
		} finally {
			if ($btn) {
				$btn.prop("disabled", false).html(original_html);
			}
		}
	}

	/**
	 * Exports an HTML table to PDF format.
	 */
	async export_table_to_pdf(table_el, filename, $btn) {
		let { headers, rows } = this.extract_table_data(table_el);
		if (!headers.length && !rows.length) {
			frappe.show_alert({ message: __("Table contains no data to export"), indicator: "orange" }, 3);
			return;
		}

		let original_html = $btn ? $btn.html() : "";
		if ($btn) {
			$btn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> <span>PDF...</span>');
		}

		try {
			let jspdf_module = await this.load_pdf_libraries();
			let { jsPDF } = jspdf_module;

			let is_landscape = headers.length > 5;
			let doc = new jsPDF({
				orientation: is_landscape ? "landscape" : "portrait",
				unit: "pt",
				format: "a4",
			});

			let title = filename ? filename.replace(/_/g, " ") : "Razyyn Financial Table";
			doc.setFontSize(13);
			doc.setTextColor(91, 69, 224); // Razyyn brand color
			doc.text(title, 40, 36);

			doc.setFontSize(8.5);
			doc.setTextColor(100, 116, 139);
			doc.text(`Generated by Razyyn AI • ${new Date().toLocaleString()}`, 40, 50);

			let autoTableFn = doc.autoTable || (jspdf_module.autoTable && doc.autoTable);
			if (typeof doc.autoTable !== "function" && typeof jspdf_module.autoTable === "function") {
				jspdf_module.autoTable(doc, {
					head: [headers],
					body: rows,
					startY: 60,
					theme: "striped",
					headStyles: {
						fillColor: [91, 69, 224],
						textColor: [255, 255, 255],
						fontStyle: "bold",
						fontSize: 8.5,
					},
					bodyStyles: {
						fontSize: 8,
						textColor: [22, 21, 43],
					},
					alternateRowStyles: {
						fillColor: [247, 247, 251],
					},
					margin: { top: 40, left: 40, right: 40, bottom: 40 },
				});
			} else {
				doc.autoTable({
					head: [headers],
					body: rows,
					startY: 60,
					theme: "striped",
					headStyles: {
						fillColor: [91, 69, 224],
						textColor: [255, 255, 255],
						fontStyle: "bold",
						fontSize: 8.5,
					},
					bodyStyles: {
						fontSize: 8,
						textColor: [22, 21, 43],
					},
					alternateRowStyles: {
						fillColor: [247, 247, 251],
					},
					margin: { top: 40, left: 40, right: 40, bottom: 40 },
					didDrawPage: function (data) {
						let str = "Page " + doc.internal.getNumberOfPages();
						doc.setFontSize(8);
						doc.setTextColor(148, 163, 184);
						doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 20);
					},
				});
			}

			doc.save((filename || "Razyyn_Table") + ".pdf");
			frappe.show_alert({ message: __("PDF file downloaded successfully"), indicator: "green" }, 3);
		} catch (err) {
			console.error("PDF export error:", err);
			frappe.show_alert(
				{ message: __("Failed to generate PDF: {0}", [err.message]), indicator: "red" },
				4
			);
		} finally {
			if ($btn) {
				$btn.prop("disabled", false).html(original_html);
			}
		}
	}

	/**
	 * Exports an HTML table to RFC-4180 CSV format with UTF-8 BOM.
	 */
	export_table_to_csv(table_el, filename) {
		let { headers, rows } = this.extract_table_data(table_el);
		if (!headers.length && !rows.length) {
			frappe.show_alert({ message: __("Table contains no data to export"), indicator: "orange" }, 3);
			return;
		}

		let csv_rows = [];
		if (headers.length) {
			csv_rows.push(
				headers
					.map((h) => {
						let safe_h = this.sanitize_cell_for_export(h, "csv");
						return '"' + safe_h.replace(/"/g, '""') + '"';
					})
					.join(",")
			);
		}

		rows.forEach((row) => {
			csv_rows.push(
				row
					.map((cell) => {
						let safe_cell = this.sanitize_cell_for_export(cell, "csv");
						return '"' + safe_cell.replace(/"/g, '""') + '"';
					})
					.join(",")
			);
		});

		let csv_content = "\uFEFF" + csv_rows.join("\r\n"); // UTF-8 BOM + CRLF
		let blob = new Blob([csv_content], { type: "text/csv;charset=utf-8;" });
		this._trigger_download(blob, (filename || "Razyyn_Table") + ".csv");
		frappe.show_alert({ message: __("CSV file downloaded successfully"), indicator: "green" }, 3);
	}

	/**
	 * Copies table data formatted as TSV to the clipboard.
	 */
	copy_table_to_clipboard(table_el, $btn) {
		let { headers, rows } = this.extract_table_data(table_el);
		if (!headers.length && !rows.length) {
			frappe.show_alert({ message: __("Table contains no data to copy"), indicator: "orange" }, 3);
			return;
		}

		let lines = [];
		if (headers.length) {
			lines.push(headers.join("\t"));
		}
		rows.forEach((r) => lines.push(r.join("\t")));
		let tsv_text = lines.join("\n");

		let on_success = () => {
			if ($btn) {
				let orig = $btn.html();
				$btn.addClass("copied").html('<i class="fa fa-check"></i> <span>' + __("Copied!") + "</span>");
				setTimeout(() => {
					$btn.removeClass("copied").html(orig);
				}, 1800);
			}
			frappe.show_alert({ message: __("Table copied to clipboard"), indicator: "green" }, 2);
		};

		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(tsv_text).then(on_success).catch(() => {
				this._fallback_copy(tsv_text, on_success);
			});
		} else {
			this._fallback_copy(tsv_text, on_success);
		}
	}

	/**
	 * Copies full message content (user message or AI response) to clipboard.
	 */
	copy_message_content(row, $btn) {
		let raw_text = row.data("raw-content");
		if (!raw_text) {
			let text_el = row.find(".agent-msg-text-content").clone();
			text_el.find(".agent-table-toolbar, .agent-msg-actions, .thinking-header-toggle").remove();
			raw_text = text_el.text().trim();
		}

		let clean_text = String(raw_text || "")
			.replace(/\[FILE:[^\]]+\]/g, "")
			.replace(/\[IMAGE:[^\]]+\]/g, "")
			.trim();

		if (!clean_text) {
			clean_text = String(raw_text || "").trim();
		}

		if (!clean_text) {
			frappe.show_alert({ message: __("No content to copy"), indicator: "orange" }, 2);
			return;
		}

		let on_success = () => {
			if ($btn && $btn.length) {
				let orig_html = $btn.html();
				$btn.addClass("copied").html(this.get_check_icon_svg());
				$btn.attr("title", __("Copied!"));
				setTimeout(() => {
					$btn.removeClass("copied").html(orig_html);
					$btn.attr("title", __("Copy message"));
				}, 1800);
			}
			frappe.show_alert({ message: __("Message copied to clipboard"), indicator: "green" }, 2);
		};

		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(clean_text).then(on_success).catch(() => {
				this._fallback_copy(clean_text, on_success);
			});
		} else {
			this._fallback_copy(clean_text, on_success);
		}
	}

	get_copy_icon_svg() {
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;
	}

	get_check_icon_svg() {
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
	}

	get_edit_icon_svg() {
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
	}

	_trigger_download(blob, filename) {
		let url = URL.createObjectURL(blob);
		let a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 200);
	}

	_fallback_copy(text, callback) {
		let textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.select();
		try {
			document.execCommand("copy");
			if (callback) callback();
		} catch (err) {
			frappe.show_alert({ message: __("Failed to copy table"), indicator: "red" }, 3);
		} finally {
			document.body.removeChild(textarea);
		}
	}

	get_mermaid_config() {
		let is_dark =
			document.documentElement.getAttribute("data-theme") === "dark" ||
			document.body.getAttribute("data-theme") === "dark" ||
			$("body").attr("data-theme") === "dark";

		if (is_dark) {
			return {
				startOnLoad: false,
				theme: "dark",
				themeVariables: {
					primaryColor: "#312e81", // Dark Indigo
					primaryTextColor: "#f8fafc", // Light slate text
					nodeTextColor: "#f8fafc",
					primaryBorderColor: "#5b45e0", // Indigo border
					lineColor: "#94a3b8", // Light slate lines
					textColor: "#f8fafc",
					background: "#0f172a",
				},
			};
		} else {
			return {
				startOnLoad: false,
				theme: "base",
				themeVariables: {
					primaryColor: "#e0e7ff", // Light Indigo
					primaryTextColor: "#0f172a", // Dark slate text
					nodeTextColor: "#0f172a",
					primaryBorderColor: "#5b45e0", // Indigo border
					lineColor: "#64748b", // Cool gray lines
					textColor: "#0f172a",
					background: "#ffffff",
				},
			};
		}
	}
}
