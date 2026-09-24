{% include "accountant_agent/accountant_agent/page/agent_chat/file_upload_handler.js" %}
{% include "accountant_agent/accountant_agent/page/agent_chat/chat_attachments_renderer.js" %}
{% include "accountant_agent/accountant_agent/page/agent_chat/chat_ui_manager.js" %}
{% include "accountant_agent/accountant_agent/page/agent_chat/chat_session_manager.js" %}
{% include "accountant_agent/accountant_agent/page/agent_chat/chat_message_handler.js" %}

/**
 * The Razyyn brand mark — the low-poly "R" from the company logo, drawn as
 * vector facets. It is inline rather than an <img> so it stays crisp at any
 * size, costs no extra request, and sits on the page's own background in both
 * the light and the dark theme.
 */
const RAZYYN_BRAND_MARK = `
	<span class="agent-brand-mark">
		<svg class="agent-brand-mark-svg" viewBox="0 0 920 1002" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
			<defs>
				<path id="razyyn-mark-body" d="M361,0L568,1L882,161L883,495L652,633L919,1000L612,1001L294,543L293,829L0,999L0,3L361,0Z M294,163L641,340L296,538L294,163Z" fill-rule="evenodd" clip-rule="evenodd"/>
				<clipPath id="razyyn-mark-clip"><use href="#razyyn-mark-body"/></clipPath>
			</defs>
			<use href="#razyyn-mark-body" fill="#1e40af"/>
			<g clip-path="url(#razyyn-mark-clip)">
				<polygon points="2,2 25,2 34,21 284,156 294,168 294,187 271,188 259,200 9,494 2,494 2,2" fill="#1c348a" stroke="#1c348a" stroke-width="8"/>
				<polygon points="285,187 294,192 274,212 31,912 13,961 2,966 2,495 19,487 260,200 285,187" fill="#3050af" stroke="#3050af" stroke-width="8"/>
				<polygon points="294,193 294,535 300,536 300,552 296,547 293,560 275,569 31,951 14,961 275,212 294,193" fill="#3d90ce" stroke="#3d90ce" stroke-width="8"/>
				<polygon points="26,2 544,3 532,20 294,165 34,20 26,2" fill="#3682c8" stroke="#3682c8" stroke-width="8"/>
				<polygon points="289,561 293,829 2,999 2,967 30,954 249,609 289,561" fill="#263f96" stroke="#263f96" stroke-width="8"/>
				<polygon points="883,175 883,495 657,627 653,618 854,215 883,175" fill="#29c3e7" stroke="#29c3e7" stroke-width="8"/>
				<polygon points="319,568 331,570 631,800 617,975 608,993 326,591 312,570 319,568" fill="#284299" stroke="#284299" stroke-width="8"/>
				<polygon points="392,106 604,162 642,332 301,165 309,152 392,106" fill="#284298" stroke="#284298" stroke-width="8"/>
				<polygon points="882,170 853,215 653,617 647,581 648,380 635,344 859,177 882,170" fill="#409dd2" stroke="#409dd2" stroke-width="8"/>
				<polygon points="318,548 653,630 631,799 331,569 311,569 301,552 318,548" fill="#3052ad" stroke="#3052ad" stroke-width="8"/>
				<polygon points="633,345 641,362 503,593 321,547 301,551 305,533 633,345" fill="#297bc3" stroke="#297bc3" stroke-width="8"/>
				<polygon points="634,811 886,976 906,977 917,999 611,999 634,811" fill="#25a7de" stroke="#25a7de" stroke-width="8"/>
				<polygon points="655,638 905,976 886,975 634,810 646,654 655,638" fill="#22d0f2" stroke="#22d0f2" stroke-width="8"/>
				<polygon points="868,153 883,169 859,176 673,320 643,332 610,166 849,163 868,153" fill="#8de3f3" stroke="#8de3f3" stroke-width="8"/>
				<polygon points="572,3 867,153 849,162 609,166 572,28 572,3" fill="#3ad9f1" stroke="#3ad9f1" stroke-width="8"/>
				<polygon points="640,363 647,380 647,609 656,628 505,593 640,363" fill="#53abd9" stroke="#53abd9" stroke-width="8"/>
				<polygon points="545,2 571,2 571,28 604,161 396,106 532,21 545,2" fill="#2d62af" stroke="#2d62af" stroke-width="8"/>
			</g>
		</svg>
	</span>
`;

/**
 * Leading icons for the auth card's fields. Inline (not an icon font) so the
 * card never waits on, or falls back oddly without, a font that has not
 * loaded yet -- the same reasoning as the brand mark above.
 */
const AUTH_ICON_COMPANY = `
	<svg class="auth-input-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<rect x="3.5" y="3" width="9" height="14" rx="1" stroke="currentColor" stroke-width="1.5"/>
		<rect x="12.5" y="8" width="4" height="9" rx="1" stroke="currentColor" stroke-width="1.5"/>
		<path d="M6 6.5H9.5M6 9.5H9.5M6 12.5H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
	</svg>
`;

const AUTH_ICON_GLOBE = `
	<svg class="auth-input-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
		<path d="M3 10H17M10 3C11.9 5.1 12.9 7.5 12.9 10C12.9 12.5 11.9 14.9 10 17C8.1 14.9 7.1 12.5 7.1 10C7.1 7.5 8.1 5.1 10 3Z" stroke="currentColor" stroke-width="1.5"/>
	</svg>
`;

const AUTH_ICON_EMAIL = `
	<svg class="auth-input-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
		<path d="M3.5 5.5L10 11L16.5 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>
`;

const AUTH_ICON_LOCK = `
	<svg class="auth-input-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<rect x="4" y="9" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
		<path d="M6.5 9V6.5C6.5 4.6 8 3 10 3C12 3 13.5 4.6 13.5 6.5V9" stroke="currentColor" stroke-width="1.5"/>
		<circle cx="10" cy="12.8" r="1.1" fill="currentColor"/>
	</svg>
`;

/**
 * Where the Terms of Use live, in the reader's own language.
 *
 * The site publishes one page per language under its own prefix, and this
 * window already runs in three (English, French, Arabic). Sending an Arabic
 * customer to the English terms and asking them to agree to it is asking for
 * agreement to something they were not given, so the link follows the window.
 *
 * Defensive about `frappe.boot` on purpose: this file is copied byte-for-byte
 * into the Odoo module, where `frappe` is a shim (razyyn_platform.js). It
 * publishes `boot.lang`, but a link that throws would take the whole sign-up
 * card down with it, so an unknown language falls back to English rather than
 * to an error.
 */
function razyyn_terms_url() {
	let lang = String(
		(window.frappe && frappe.boot && frappe.boot.lang) || 'en'
	).slice(0, 2).toLowerCase();
	return (lang === 'ar' || lang === 'fr')
		? `https://razyyn.com/${lang}/terms/`
		: 'https://razyyn.com/terms/';
}

frappe.pages['agent-chat'].on_page_load = function (wrapper) {
	try {
		delete localStorage['_page:agent-chat'];
	} catch (e) {}

	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Razyyn AI'),
		single_column: true
	});

	// This page draws its own full header — the dark sidebar's "+ New Chat",
	// and the "Connected: email / language / dark-mode / Settings" row inside
	// .agent-chat-view — so Frappe's native title bar above it would only be a
	// second, redundant header strip with nothing of its own to show. Hidden
	// once, here: this callback runs a single time per visit to the route
	// (Frappe reuses the same page DOM on later visits), and the class survives
	// every re-render this file does inside `.page-content` below it.
	$(wrapper).find('.page-head').addClass('hide');

	// Dynamically load Mermaid from CDN to support all Frappe versions (including v14)
	if (!window.mermaid) {
		let script = document.createElement('script');
		script.src = '/assets/accountant_agent/js/mermaid.min.js';
		script.onload = () => {
			if (window.mermaid) {
				mermaid.initialize({
					startOnLoad: false,
					theme: 'base',
					themeVariables: {
						primaryColor: '#10a37f', // Emerald Green node background
						primaryTextColor: '#111827', // Dark node text
						nodeTextColor: '#111827', // Dark node text fallback
						primaryBorderColor: '#0d8a6a', // Darker green node border
						lineColor: '#4b5563', // Dark gray lines for flowcharts
						textColor: '#111827', // Dark gray default text color (legends, labels)
						labelTextColor: '#111827', // Dark label text on connector lines
						edgeLabelBackground: '#ffffff', // White background for connector line text labels
						secondaryColor: '#f3f4f6',
						tertiaryColor: '#ffffff',
						pie1: '#10a37f', // Emerald Green
						pie2: '#3b82f6', // Ocean Blue
						pie3: '#f59e0b', // Amber Yellow
						pie4: '#8b5cf6', // Indigo/Purple
						pie5: '#ec4899', // Pink
						pie6: '#ef4444', // Red/Danger
						pie7: '#06b6d4', // Cyan
						pie8: '#14b8a6', // Teal
						pieTitleTextColor: '#111827', // Dark title text
						pieSectionTextColor: '#ffffff', // White text on slices
						pieLegendTextColor: '#111827', // Dark legend text
						pieDataTextColor: '#111827', // Dark label text outside slices
						xyChart: {
							plotColorPalette: '#10a37f, #3b82f6, #f59e0b, #8b5cf6, #ec4899, #ef4444, #06b6d4, #14b8a6',
							titleColor: '#111827',
							xAxisLabelColor: '#4b5563',
							xAxisTitleColor: '#111827',
							xAxisLineColor: '#e5e7eb',
							yAxisLabelColor: '#4b5563',
							yAxisTitleColor: '#111827',
							yAxisLineColor: '#e5e7eb',
							plotColor: '#10a37f'
						}
					},
					// 'strict' (the marked/mermaid default) HTML-escapes text
					// inside diagram labels instead of rendering it, closing
					// the XSS path a diagram label built from LLM output would
					// otherwise open. No code in this app relies on mermaid's
					// loose-only click-bindings, so nothing here depends on
					// 'loose'.
					securityLevel: 'strict'
				});
			}
		};
		document.head.appendChild(script);
	}

	// Dynamically load Chart.js from CDN. Pinned version + Subresource
	// Integrity so a compromised or MITM'd CDN response can't silently swap
	// in different code.
	if (!window.Chart) {
		let script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js';
		script.integrity = 'sha384-dug+JxfBvklEQdJ4AYuBBAIScUz0bVN73xpy273gcAwHjb3qI0fXmuYNaNfdyYJG';
		script.crossOrigin = 'anonymous';
		document.head.appendChild(script);
	}

	// Dynamically load DOMPurify from CDN before marked.js. All markdown/HTML
	// rendered from AI responses (chat_ui_manager.js parse_markdown) is piped
	// through DOMPurify.sanitize() before it ever reaches a raw .html() call,
	// so DOMPurify must be available before any message is rendered.
	if (!window.DOMPurify) {
		let script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js';
		script.integrity = 'sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a';
		script.crossOrigin = 'anonymous';
		document.head.appendChild(script);
	}

	// Dynamically load marked.js from CDN. Pinned to a specific release (the
	// custom Renderer.code override below is compatible with the token-object
	// signature marked has used since 5.x, and with the legacy (code, lang)
	// signature) with Subresource Integrity, rather than tracking `latest`
	// unpinned from an unauthenticated CDN.
	if (!window.marked) {
		let script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
		script.integrity = 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi';
		script.crossOrigin = 'anonymous';
		script.onload = () => {
			if (window.marked) {
				const renderer = new window.marked.Renderer();
				renderer.code = function(code, language) {
					let code_text = code;
					let lang = language;
					if (code && typeof code === 'object') {
						code_text = code.text;
						lang = code.lang;
					}
					if (lang === 'mermaid') {
						let escaped_code = encodeURIComponent(code_text.trim());
						return `<div class="mermaid-container" data-processed="false" data-code="${escaped_code}"></div>`;
					}
					if (lang === 'chartjs') {
						let escaped_code = encodeURIComponent(code_text.trim());
						return `<div class="chartjs-container" data-processed="false" data-code="${escaped_code}"></div>`;
					}
					return `<pre><code>${code_text}</code></pre>`;
				};
				window.marked.use({
					renderer: renderer,
					breaks: true,
					gfm: true
				});
			}
		};
		document.head.appendChild(script);
	}

	frappe.pages['agent-chat'].agent_chat_instance = new AccountantAgentChat(wrapper, page);
};

frappe.pages['agent-chat'].on_page_show = function (wrapper) {
	let instance = frappe.pages['agent-chat'].agent_chat_instance;
	if (instance && instance.connected) {
		instance.load_active_banner();
	}
};

class AccountantAgentChat {
	constructor(wrapper, page) {
		this.wrapper = $(wrapper);
		this.page = page;

		this.connected = false;
		this.connected_email = null;
		this.active_tab = 'login';

		this.active_streams = {};

		// Instantiate Sub-Managers (Separation of Responsibilities)
		this.file_upload_handler = null;
		this.attachments_renderer = new ChatAttachmentsRenderer();
		this.ui_manager = new ChatUIManager(this);
		this.session_manager = new ChatSessionManager(this);
		this.message_handler = new ChatMessageHandler(this);

		frappe.realtime.on("agent_clarification_requested", (data) => {
			if (data && data.session_id) {
				this.message_handler.show_clarification_popup(data.questions, data.session_id);
			}
		});

		// How far the reading of this message's documents has got. Sent by the
		// same worker that is running the turn, once per page, and shown only
		// on the conversation it belongs to — a second chat open in another tab
		// must not draw somebody else's progress.
		frappe.realtime.on("agent_scan_progress", (data) => {
			if (!data || !data.session_id) return;
			if (data.session_id !== this.session_manager.session_id) return;
			if (this.message_handler.cancelled_sessions.has(data.session_id)) return;

			if (data.finished) {
				this.ui_manager.hide_reading_progress(this.msg_box);
			} else {
				this.ui_manager.show_reading_progress(this.msg_box, data);
			}
		});

		frappe.realtime.on("agent_message_chunk", (data) => {
			if (data && data.session_id) {
				if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
				let stream = this.ensure_stream(data.session_id);
				stream.accumulated += data.chunk;

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_bubble(this.msg_box, stream.bubble_id, stream.accumulated);
				}
			}
		});

		frappe.realtime.on("agent_message_reasoning", (data) => {
			if (data && data.session_id) {
				if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
				let stream = this.ensure_stream(data.session_id);
				stream.reasoning += data.chunk;

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_reasoning(this.msg_box, stream.bubble_id, stream.reasoning);
				}
			}
		});

		// A MANAGER SENTENCE THAT IS NOT THE TURN'S ANSWER: "added the VAT
		// check as step 4", the reply to something asked while the work ran,
		// the sentence that presents a waiting step's question. Its own
		// bubble, above the working one; the working one keeps working.
		frappe.realtime.on("agent_aside", (data) => {
			if (!data || !data.session_id || !data.text) return;
			if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
			if (data.session_id !== this.session_manager.session_id) return;
			this.ui_manager.append_message(this.msg_box, "ai", data.text, false, new Date().toISOString());
			let aside_row = this.msg_box.find(".agent-msg-row").last();
			let stream = this.active_streams && this.active_streams[data.session_id];
			let working_row = stream ? this.msg_box.find(`#row-${stream.bubble_id}`) : null;
			if (working_row && working_row.length) {
				aside_row.insertBefore(working_row);
			}
			this.ui_manager.scroll_to_bottom(this.msg_box);
		});

		// THE MANAGER HEARD A MESSAGE SENT WHILE IT WORKED. Nothing to draw:
		// the customer's bubble is already on screen, no turn of its own was
		// started, and whatever the manager says back arrives as an aside on
		// the running turn's stream.
		frappe.realtime.on("agent_message_noted", (data) => {
			if (!data || !data.session_id) return;
			this.message_handler.stop_result_recovery(data.session_id);
		});

		frappe.realtime.on("agent_node_start", (data) => {
			if (data && data.session_id) {
				if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
				let stream = this.ensure_stream(data.session_id);
				if (data.agent) stream.current_agent = data.agent;
				let node_display_names = {
					"understand": __("Understanding question & reviewing context..."),
					"fetch_data": __("Retrieving data from ERPNext / Excel files..."),
					"clean_data": __("Profiling and cleaning raw data..."),
					"analyse_chunk": __("Analyzing chunk data..."),
					"compile": __("Generating final business report & Mermaid charts..."),
					"agent": __("Thinking...")
				};
				// The agent sends the words it wants shown, in the customer's
				// language rather than the pipeline's. The table above names
				// steps of a pipeline that has since been replaced, so without
				// this every step of every run fell through to "Processing..."
				// — one caption for a whole run, which reads as a hang. It is
				// kept only as a fallback for an older agent server.
				let display = data.label || node_display_names[data.node] || __("Processing...");
				stream.status = display;
				this.push_step(stream, display, 'node');

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_status(this.msg_box, stream.bubble_id, display, stream.steps, stream);
				}
			}
		});

		frappe.realtime.on("agent_tool_start", (data) => {
			if (data && data.session_id) {
				if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
				let stream = this.ensure_stream(data.session_id);
				if (data.agent) stream.current_agent = data.agent;
				let tool_display_names = {
					"db_query_sender": __("Querying ERPNext SQL database..."),
					"get_doctype_schema": __("Reading DocType schema..."),
					"web_search": __("Searching web for information..."),
					"calculation": __("Performing calculations..."),
					"read_document_file": __("Reading attached document..."),
					"get_excel_sheets": __("Reading sheets from Excel file..."),
					"query_excel_sheet": __("Querying Excel sheet data...")
				};
				// Same source, same reason. The old fallback printed the
				// internal name of the tool to the customer, which is exactly
				// what project_rules.md §6 forbids.
				let display = data.label || tool_display_names[data.tool] || __("Working on it...");
				stream.status = display;
				this.push_step(stream, display, 'tool');

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_status(this.msg_box, stream.bubble_id, display, stream.steps, stream);
				}
			}
		});

		frappe.realtime.on("agent_todo_update", (data) => {
			if (data && data.session_id) {
				if (this.message_handler.cancelled_sessions.has(data.session_id)) return;
				this.active_streams = this.active_streams || {};
				if (!this.active_streams[data.session_id]) {
					this.active_streams[data.session_id] = {
						bubble_id: `stream-${this.generate_uuid()}`,
						accumulated: "",
						reasoning: "",
						steps: [],
						status: "",
						start_time: Date.now(),
						elapsed_seconds: 0
					};
					this.start_stream_timer(data.session_id);
				}
				let stream = this.active_streams[data.session_id];
				stream.todo = { status: data.status || '', tasks: data.tasks || [] };

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.render_todo_list(this.msg_box, stream.bubble_id, stream.todo);
				}
			}
		});

		frappe.realtime.on("agent_message_done", async (data) => {
			if (data && data.session_id) {
				this.message_handler.stop_result_recovery(data.session_id);
				if (this.message_handler.cancelled_sessions.has(data.session_id)) {
					this.message_handler.cancelled_sessions.delete(data.session_id);
					return;
				}
				this.stop_stream_timer(data.session_id);
				let active_session_id = this.session_manager.session_id;
				let header_title = __("Completed");
				//: Whether the answer actually reached the screen. See below.
				let drew_into_a_bubble = false;
				//: Where the run had got to when it ended. Read before the stream is
				//: dropped, because it decides whether the checklist survives the turn.
				let run_status = "";

				if (this.active_streams && this.active_streams[data.session_id]) {
					let stream = this.active_streams[data.session_id];
					let duration = stream.elapsed_seconds || 0;
					run_status = (stream.todo && stream.todo.status) || "";
					if (stream.reasoning) {
						header_title = `${__("Thought for")} ${duration}s`;
					} else {
						header_title = `${__("Worked for")} ${duration}s`;
					}

					stream.current_agent = data.agent || stream.current_agent;

					if (data.session_id === active_session_id) {
						drew_into_a_bubble =
							this.msg_box.find(`#${stream.bubble_id}`).length > 0;
						this.ui_manager.finalize_stream_bubble(
							this.msg_box,
							stream.bubble_id,
							data.response,
							new Date().toISOString(),
							header_title,
							stream
						);
					}
					delete this.active_streams[data.session_id];
				}

				// A TURN THIS PAGE DID NOT START, FINISHING WHILE WE WATCH.
				//
				// The block above writes the answer into the bubble the turn
				// opened on this page. There is no such bubble when the customer
				// reloaded mid-run, or has the same chat open in a second tab,
				// or sent the message from their phone — the events still
				// arrive, the answer is written nowhere, and the chat sits
				// looking finished and empty until they click the conversation
				// again.
				//
				// Checked by looking for the bubble rather than by trusting
				// `active_streams`, because a reloaded page acquires a stream
				// object from the events themselves without ever having drawn
				// anything.
				//
				// The turn is committed by the time this event is sent, so the
				// stored transcript IS the answer, and redrawing it is both
				// correct and cheap.
				if (data.session_id === active_session_id && !drew_into_a_bubble) {
					await this.session_manager.load_chat_history();
				}

				// THE CHECKLIST BELONGS TO THE RUN, AND THE RUN HAS ENDED.
				//
				// It used to be taken down only when a final checklist arrived saying
				// so — but not every way a run can end sends one, so finished work
				// could leave a list of steps sitting under the answer with one of
				// them still marked as waiting. The end of the turn is the signal that
				// always arrives, so that is what takes the checklist down.
				//
				// The exception is a run that has stopped to ask something: a plan to
				// approve, or a question to answer. The turn is over, the work is not,
				// and somebody deciding whether to approve the next step must be able
				// to see what is done and what is still to come.
				//
				// Only for an answer drawn live. Where there was no bubble the whole
				// transcript is rebuilt above, and that rebuild asks the server what
				// the run is really doing — a better answer than anything kept here.
				if (
					data.session_id === active_session_id &&
					drew_into_a_bubble &&
					!this.run_awaits_the_customer(run_status, data.response)
				) {
					this.ui_manager.clear_todo_panels(this.msg_box);
				}

				if (data.session_id === active_session_id) {
					this.ui_manager.hide_typing_indicator(this.msg_box);
					this.message_handler.set_button_state('send');
				}
				await this.session_manager.load_chats(false);

				// A finished turn is the one moment usage reliably changed.
				// Not awaited: the badge catching up a beat later is fine, and
				// this must never hold up the chat rebuild above it. Only on
				// "done" (not the error/cancel events below) — a turn that
				// never reached the platform, or that the customer stopped,
				// is not expected to have moved the usage number.
				this.load_plan_indicator();
			}
		});

		frappe.realtime.on("agent_message_error", async (data) => {
			if (data && data.session_id) {
				this.message_handler.stop_result_recovery(data.session_id);
				if (this.message_handler.cancelled_sessions.has(data.session_id)) {
					this.message_handler.cancelled_sessions.delete(data.session_id);
					return;
				}
				this.stop_stream_timer(data.session_id);
				let active_session_id = this.session_manager.session_id;

				if (this.active_streams && this.active_streams[data.session_id]) {
					let stream = this.active_streams[data.session_id];
					if (data.session_id === active_session_id) {
						this.ui_manager.finalize_stream_bubble(
							this.msg_box,
							stream.bubble_id,
							`⚠️ **Error:** ${data.error || __("An error occurred during execution.")}`,
							new Date().toISOString(),
							__("Failed")
						);
					}
					delete this.active_streams[data.session_id];
				}

				if (data.session_id === active_session_id) {
					this.ui_manager.clear_todo_panels(this.msg_box);
					this.ui_manager.hide_typing_indicator(this.msg_box);
					this.message_handler.set_button_state('send');
				}
				await this.session_manager.load_chats(false);
			}
		});

		frappe.realtime.on("agent_message_cancelled", async (data) => {
			if (data && data.session_id) {
				this.message_handler.stop_result_recovery(data.session_id);
				this.message_handler.cancelled_sessions.delete(data.session_id);
				this.stop_stream_timer(data.session_id);
				let active_session_id = this.session_manager.session_id;

				if (this.active_streams && this.active_streams[data.session_id]) {
					let stream = this.active_streams[data.session_id];
					if (data.session_id === active_session_id) {
						this.ui_manager.finalize_stream_bubble(
							this.msg_box,
							stream.bubble_id,
							`⚠️ **Cancelled**`,
							new Date().toISOString(),
							__("Cancelled")
						);
					}
					delete this.active_streams[data.session_id];
				}

				if (data.session_id === active_session_id) {
					this.ui_manager.clear_todo_panels(this.msg_box);
					this.ui_manager.hide_typing_indicator(this.msg_box);
					this.message_handler.set_button_state('send');
				}
				await this.session_manager.load_chats(false);
			}
		});

		this.init();
	}

	async init() {
		this.ui_manager.clear_typing_timers();
		this.wrapper.find('.page-content').empty();
		this.page.clear_primary_action();

		this.container = $('<div class="agent-chat-container"></div>').appendTo(this.wrapper.find('.page-content'));

		await this.check_connection();

		if (this.connected) {
			await this.render_chat_view();
		} else {
			this.render_auth_card();
		}
	}

	async check_connection() {
		frappe.dom.freeze(__('Checking agent connection...'));
		try {
			let agent_email = localStorage.getItem('connected_agent_email');
			let res = await frappe.xcall(
				'accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_connection_status',
				{ agent_email: agent_email }
			);
			this.connected = res.connected;
			this.connected_email = res.email;
		} catch (e) {
			console.error("Connection check failed:", e);
			this.connected = false;
			this.connected_email = null;
		} finally {
			frappe.dom.unfreeze();
		}
	}

	render_auth_card() {
		this.container.empty();

		let card_html = `
			<div class="agent-auth-card">
				<div class="agent-auth-header">
					${RAZYYN_BRAND_MARK}
					<h3 class="agent-auth-title">Razyyn</h3>
					<p class="agent-auth-tagline">${__('Intelligent Accountancy')}</p>
				</div>
				<ul class="nav nav-tabs d-flex justify-content-center">
					<li class="nav-item">
						<a class="nav-link ${this.active_tab === 'login' ? 'active' : ''}" data-tab="login">${__('Login')}</a>
					</li>
					<li class="nav-item">
						<a class="nav-link ${this.active_tab === 'signup' ? 'active' : ''}" data-tab="signup">${__('Sign Up')}</a>
					</li>
				</ul>

				<div class="auth-form-container">
					<form id="agent-auth-form">
						<div class="form-group signup-field" style="display: ${this.active_tab === 'signup' ? 'block' : 'none'};">
							<label for="auth-company">${__('Company Name')}</label>
							<div class="auth-input-wrap">
								${AUTH_ICON_COMPANY}
								<input type="text" id="auth-company" placeholder="e.g. My Company Corp">
							</div>
						</div>

						<div class="form-group signup-field" style="display: ${this.active_tab === 'signup' ? 'block' : 'none'};">
							<label for="auth-country">${__('Country')}</label>
							<div class="auth-input-wrap">
								${AUTH_ICON_GLOBE}
								<select id="auth-country">
									<option value="">${__('Loading countries…')}</option>
								</select>
							</div>
							<small class="text-muted auth-country-note">${__('The country your books are kept under. It decides which accounting law the agent applies.')}</small>
						</div>

						<div class="form-group">
							<label for="auth-email">${__('Email Address')}</label>
							<div class="auth-input-wrap">
								${AUTH_ICON_EMAIL}
								<input type="email" id="auth-email" placeholder="email@example.com" required>
							</div>
						</div>

						<div class="form-group">
							<label for="auth-password">${__('Password')}</label>
							<div class="auth-input-wrap">
								${AUTH_ICON_LOCK}
								<input type="password" id="auth-password" placeholder="••••••••" required>
							</div>
						</div>

						<div class="form-group signup-field agent-auth-terms" style="display: ${this.active_tab === 'signup' ? 'block' : 'none'};">
							<label for="auth-terms">
								<input type="checkbox" id="auth-terms">
								<span>${__('I have read and agree to the')}
									<a href="${razyyn_terms_url()}" target="_blank" rel="noopener noreferrer">${__('Terms of Use')}</a>
								</span>
							</label>
						</div>

						<button type="submit" class="agent-auth-btn">
							${this.active_tab === 'login' ? __('Connect') : __('Create Account')}
						</button>
					</form>
				</div>
			</div>
		`;

		let $card = $(card_html).appendTo(this.container);
		this.setup_auth_events($card);
		// Settled on every render, whichever tab is showing: a button whose
		// state is only ever set inside a fetch keeps a stale one whenever that
		// fetch does not run.
		this.update_auth_button_state($card);
		// Only the Sign Up tab needs the list, so somebody who came here to log
		// in never waits on a call they have no use for.
		if (this.active_tab === 'signup') this.load_signup_countries($card);
	}

	// The country list comes from the platform, never from a copy kept here:
	// the platform refuses a code outside its own list, so a list maintained in
	// this app would eventually offer a country the registration is then
	// refused for — after the customer had typed a password.
	//
	// Fetched once per card. If it cannot be fetched, sign-up is disabled with
	// the reason shown, because the same server is what creates the account: a
	// form that lets someone fill it in anyway would fail at the last step.
	async load_signup_countries($card) {
		let $select = $card.find('#auth-country');
		if (!$select.length || this.signup_countries_loading) return;
		// Deliberately NOT cached across attempts. The interesting case is the
		// one where it failed — the platform was down for a moment — and the
		// only recovery a customer has is coming back to this tab. One small
		// GET is a cheap price for a form that heals itself instead of staying
		// broken until the page is reloaded.
		if (this.signup_countries_loaded) return;
		this.signup_countries_loading = true;
		$card.find('.auth-country-note')
			.text(__('The country your books are kept under. It decides which accounting law the agent applies.'))
			.css('color', '');
		try {
			let res = await frappe.xcall(
				'accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_signup_countries'
			);
			let countries = (res && res.countries) || [];
			let chosen = (res && res.suggested) || '';
			if (!countries.length) {
				// The server answered and had nothing to give — it could not
				// reach the platform. Said here, beside the box, rather than in
				// a dialog over a form nobody has filled in yet.
				throw new Error((res && res.error) || __('Could not load countries'));
			}
			$select.empty().append(
				`<option value="">${__('Select your country')}</option>`
			);
			countries.forEach((country) => {
				$select.append(
					$('<option></option>').attr('value', country.code).text(country.name)
				);
			});
			if (chosen) $select.val(chosen);
			this.signup_countries_failed = false;
			this.signup_countries_error = '';
			// Only a successful list is remembered; a failure is retried.
			this.signup_countries_loaded = true;
		} catch (err) {
			console.error('Could not load the country list:', err);
			this.signup_countries_failed = true;
			this.signup_countries_loaded = false;
			this.signup_countries_error = (err && err.message) || __('Could not load countries');
			$select.empty().append(
				`<option value="">${__('Could not load countries')}</option>`
			);
			$card.find('.auth-country-note')
				.text(this.signup_countries_error + ' ' + __('Switch to Login and back to try again.'))
				.css('color', 'var(--red-500, #b91c1c)');
		} finally {
			this.signup_countries_loading = false;
			this.update_auth_button_state($card);
		}
	}

	// Sign-up needs a country; login does not. One place decides, so the button
	// can never be enabled on a form that cannot be submitted.
	update_auth_button_state($card) {
		let $button = $card.find('.agent-auth-btn');
		let blocked = this.active_tab === 'signup' && this.signup_countries_failed;
		$button.prop('disabled', blocked);
		$button.attr(
			'title',
			blocked ? __('The Agent Server could not be reached to load the country list.') : ''
		);
	}

	setup_auth_events($card) {
		$card.find('.nav-link').on('click', (e) => {
			let tab = $(e.currentTarget).data('tab');
			this.active_tab = tab;
			$card.find('.nav-link').removeClass('active');
			$(e.currentTarget).addClass('active');

			if (tab === 'signup') {
				$card.find('.signup-field').slideDown(200);
				$card.find('.agent-auth-btn').text(__('Create Account'));
				this.load_signup_countries($card);
			} else {
				$card.find('.signup-field').slideUp(200);
				$card.find('.agent-auth-btn').text(__('Connect'));
			}
			this.update_auth_button_state($card);
		});

		$card.find('#agent-auth-form').on('submit', async (e) => {
			e.preventDefault();

			let company_name = $card.find('#auth-company').val();
			let email = $card.find('#auth-email').val();
			let password = $card.find('#auth-password').val();
			let country_code = $card.find('#auth-country').val();
			let accepted_terms = $card.find('#auth-terms').is(':checked');

			// Asked for, not defaulted. The platform would accept a
			// registration without it and fall back to Egypt, which is the
			// silent wrong answer for every customer outside Egypt — their
			// books audited against a law that is not theirs, with nothing
			// reporting an error.
			if (this.active_tab === 'signup' && !country_code) {
				frappe.show_alert({
					message: __('Please choose the country your books are kept under.'),
					indicator: 'orange',
				});
				return;
			}

			// Refused HERE rather than by disabling the button: an unticked box
			// is a form somebody has not finished, not a form that cannot
			// succeed. The button is reserved for the second kind (the country
			// list could not be loaded, so the account cannot be created at
			// all), and a disabled button would also have to be re-enabled from
			// a handler on the box — a second place to get wrong.
			if (this.active_tab === 'signup' && !accepted_terms) {
				frappe.show_alert({
					message: __('Please accept the Terms of Use to create an account.'),
					indicator: 'orange',
				});
				return;
			}

			frappe.dom.freeze(this.active_tab === 'login' ? __('Connecting...') : __('Creating Account...'));

			try {
				let res = await frappe.xcall(
					'accountant_agent.accountant_agent.page.agent_chat.agent_chat.authenticate_agent',
					{
						mode: this.active_tab,
						email: email,
						password: password,
						company_name: company_name,
						country_code: country_code,
						accepted_terms: accepted_terms
					}
				);

				if (res && res.success) {
					frappe.show_alert({ message: __('Connected successfully!'), indicator: 'green' });
					this.connected = true;
					this.connected_email = res.email;
					localStorage.setItem('connected_agent_email', res.email);
					await this.render_chat_view();
				}
			} catch (err) {
				console.error(err);
			} finally {
				frappe.dom.unfreeze();
			}
		});
	}

	async render_chat_view() {
		this.container.empty();

		let chat_html = `
			<div class="agent-chat-layout">
				<!-- Left Sidebar (Sessions List) -->
				<div class="agent-sidebar">
					<button class="new-chat-btn">
						<i class="fa fa-plus"></i> ${__('New Chat')}
					</button>
					<div class="agent-chat-list"></div>
				</div>

				<!-- Main Chat View Area -->
				<div class="agent-chat-view">
					<!-- Header -->
					<div class="agent-chat-header">
						<div class="agent-topbar-left">
							<div class="agent-topbar-brand">
								${RAZYYN_BRAND_MARK}
								<span class="agent-topbar-brand-text">${__('Razyyn AI')}</span>
							</div>
							<div class="agent-status-container">
								<div class="agent-status-badge">
									<div class="agent-status-dot"></div>
									${__('Connected:')} <a href="javascript:void(0)" class="agent-email-link" title="${__('Click to view Agent Settings')}"><strong>${this.connected_email}</strong> <i class="fa fa-cog" style="font-size: 11px; margin-left: 3px;"></i></a>
								</div>
								<button type="button" class="agent-plan-badge" title="${__('Loading your plan…')}"></button>
							</div>
						</div>
						<div class="agent-header-banner" id="agent-header-banner" style="display: none;"></div>
						<div class="agent-header-actions" style="display: flex; align-items: center; gap: 12px;">
							<select class="agent-lang-selector form-control" style="width: 100px; padding: 2px 6px; height: 28px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; background-color: var(--chat-card-bg); color: var(--chat-text); border: 1px solid var(--chat-border);">
								<option value="en" ${frappe.boot.lang === 'en' ? 'selected' : ''}>English</option>
								<option value="fr" ${frappe.boot.lang === 'fr' ? 'selected' : ''}>Français</option>
								<option value="ar" ${frappe.boot.lang === 'ar' ? 'selected' : ''}>العربية</option>
							</select>
							<button class="agent-theme-toggle-btn btn btn-xs btn-default" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border-radius: 6px;" title="${__('Toggle Theme')}">
								<i class="fa fa-moon-o"></i>
							</button>
							<button class="agent-settings-btn btn btn-xs btn-default" style="display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px;">
								<i class="fa fa-cog"></i> ${__('Settings')}
							</button>
						</div>
					</div>

					<!-- Messages Container -->
					<div class="agent-messages-wrapper" style="position: relative; flex: 1; min-height: 0; display: flex;">
						<div class="agent-messages-container" id="agent-msg-box"></div>
						<button type="button" class="agent-scroll-to-bottom-btn" id="agent-scroll-to-bottom">
							<i class="fa fa-arrow-down"></i> ${__('New messages')}
						</button>
					</div>

					<!-- Input Area -->
					<div class="agent-input-container">
						<div class="agent-clarification-popup" style="display: none;"></div>
						<div class="agent-input-card">
							<textarea class="agent-textarea" dir="auto" placeholder="${__('Type your financial question or query here...')}" id="agent-input-msg" maxlength="10000"></textarea>
							<div class="agent-input-footer">
								<div class="agent-input-footer-left"></div>
								<div class="agent-input-footer-right">
									<div class="agent-char-counter">0 / 10000</div>
									<button class="agent-stop-btn" id="agent-stop-trigger" title="${__('Stop the work')}" style="display: none;">
										<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
									</button>
									<button class="agent-send-btn" id="agent-send-trigger" title="${__('Send Message')}">
										<svg viewBox="0 0 24 24">
											<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

		this.layout = $(chat_html).appendTo(this.container);
		this.sidebar = this.layout.find('.agent-sidebar');
		this.msg_box = this.layout.find('#agent-msg-box');
		this.textarea = this.layout.find('#agent-input-msg');
		this.popup_container = this.layout.find('.agent-clarification-popup');

		// Initialize File Upload Handler
		this.file_upload_handler = new FileUploadHandler(this);
		this.file_upload_handler.init(
			this.layout.find('.agent-input-container'),
			this.textarea
		);

		this.setup_chat_events();
		this.load_plan_indicator();
		this.load_active_banner();

		await this.session_manager.load_chats();
	}

	setup_chat_events() {
		this.layout.find('.agent-email-link, .agent-plan-badge').on('click', (e) => {
			e.preventDefault();
			this.open_agent_settings();
		});

		this.sidebar.find('.new-chat-btn').on('click', () => {
			this.session_manager.set_new_chat_draft();
		});

		this.layout.find('#agent-scroll-to-bottom').on('click', () => {
			this.ui_manager.jump_to_bottom(this.msg_box);
		});

		this.layout.find('.agent-settings-btn').on('click', () => {
			let self = this;
			let d = new frappe.ui.Dialog({
				title: __('Agent Settings'),
				fields: [
					{
						fieldtype: 'HTML',
						options: `
							<div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: var(--text-color);">
								${__('Manage your Razyyn connection and account settings.')}
							</div>
							<div style="display: flex; flex-direction: column; gap: 10px;">
								<button class="btn btn-default btn-block logout-action-btn" style="text-align: left; display: flex; align-items: center; gap: 8px; padding: 10px 15px; margin: 0;">
									<i class="fa fa-sign-out text-muted" style="font-size: 16px; width: 20px;"></i>
									<div>
										<strong style="display: block; font-size: 13px;">${__('Log Out')}</strong>
										<span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">${__('Disconnect the agent temporarily.')}</span>
									</div>
								</button>
								<button class="btn btn-danger btn-block delete-action-btn" style="text-align: left; display: flex; align-items: center; gap: 8px; padding: 10px 15px; background-color: var(--bg-red-light, #fff5f5); border-color: var(--border-red, #ffcccc); color: var(--text-red, #c53030); margin: 0;">
									<i class="fa fa-trash" style="font-size: 16px; width: 20px;"></i>
									<div>
										<strong style="display: block; font-size: 13px;">${__('Delete Account')}</strong>
										<span style="font-size: 11px; color: var(--text-red, #c53030); opacity: 0.8; font-weight: normal;">${__('Permanently delete your account.')}</span>
									</div>
								</button>
							</div>
						`
					}
				]
			});

			d.$wrapper.find('.logout-action-btn').on('click', async () => {
				d.hide();
				await self.logout_agent();
			});

			d.$wrapper.find('.delete-action-btn').on('click', () => {
				// `d.hide()` runs only once the customer actually confirms,
				// exactly as before this was pulled out into a shared method —
				// pressing "Delete Account" and then cancelling the confirm
				// leaves this Settings dialog open rather than dismissing it
				// pre-emptively.
				self.confirm_delete_account(() => d.hide());
			});

			d.show();
		});

		this.auto_resize_textarea = () => {
			if (!this.textarea || !this.textarea.length) return;
			this.textarea.css('height', 'auto');
			let scroll_h = this.textarea[0].scrollHeight || 46;
			let new_height = Math.max(46, Math.min(scroll_h, 300));
			this.textarea.css('height', new_height + 'px');
			let length = (this.textarea.val() || '').length;
			this.layout.find('.agent-char-counter').text(`${length} / 10000`);
		};

		this.textarea.on('input', () => {
			this.auto_resize_textarea();
		});

		this.textarea.on('keydown', (e) => {
			if (e.which === 13 && !e.shiftKey) {
				e.preventDefault();
				// The composer is open while the manager works: Enter sends,
				// and a message sent mid-run reaches the manager as a note.
				this.message_handler.send_user_message();
			}
		});

		this.layout.find('#agent-send-trigger').on('click', () => {
			this.message_handler.send_user_message();
		});

		// The stop button is its own control now, shown only while a run is
		// in flight. It used to be the send button wearing a different face,
		// which is why the composer had to close: one button cannot both send
		// a word to the manager and stop the work.
		this.layout.find('#agent-stop-trigger').on('click', () => {
			this.message_handler.cancel_agent_execution();
		});

		this.layout.find('.agent-lang-selector').on('change', (e) => {
			let selected_lang = $(e.target).val();
			frappe.call({
				method: "frappe.client.set_value",
				args: {
					doctype: "User",
					name: frappe.session.user,
					fieldname: "language",
					value: selected_lang
				},
				callback: function(r) {
					if (!r.exc) {
						window.location.reload();
					}
				}
			});
		});

		// Theme Toggle Handler
		let theme_toggle = this.layout.find('.agent-theme-toggle-btn');
		let current_theme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('agent-theme') || 'light';
		document.documentElement.setAttribute('data-theme', current_theme);
		update_theme_icon(current_theme);

		theme_toggle.on('click', () => {
			let new_theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-theme', new_theme);
			localStorage.setItem('agent-theme', new_theme);
			update_theme_icon(new_theme);
		});

		function update_theme_icon(theme) {
			let icon = theme_toggle.find('i');
			if (theme === 'dark') {
				icon.removeClass('fa-moon-o').addClass('fa-sun-o');
			} else {
				icon.removeClass('fa-sun-o').addClass('fa-moon-o');
			}
		}
	}

	show_clarification_popup(questions) {
		this.message_handler.show_clarification_popup(questions);
	}

	// Shared by the "Connected: <email>" link in the custom topbar and by the
	// plan badge below — both open the same Agent Settings record.
	async open_agent_settings() {
		if (!this.connected_email) return;
		try {
			let doc_name = await frappe.xcall(
				'accountant_agent.accountant_agent.doctype.agent_settings.agent_settings.get_agent_settings_name',
				{ email: this.connected_email }
			);
			if (doc_name) {
				frappe.set_route('Form', 'Agent Settings', doc_name);
			} else {
				frappe.show_alert({ message: __('Agent Settings record not found.'), indicator: 'orange' });
			}
		} catch (err) {
			console.error("Error opening Agent Settings:", err);
		}
	}

	// The read-only plan/usage badge, using the same
	// agent_settings.get_user_usage endpoint the Agent Settings form's own
	// "API Resource Usage" panel already calls — one number (percentage of
	// the monthly plan spent) and the plan name, nothing invented here.
	async load_plan_indicator() {
		if (!this.connected_email) return;
		try {
			let data = await frappe.xcall(
				'accountant_agent.accountant_agent.doctype.agent_settings.agent_settings.get_user_usage',
				{ email: this.connected_email }
			);
			this.render_plan_indicator(data);
		} catch (e) {
			console.error("Could not load plan usage:", e);
		}
	}

	render_plan_indicator(data) {
		if (!this.layout) return;
		let badge = this.layout.find('.agent-plan-badge');
		if (!badge.length) return;

		let plan_raw = (data && data.plan) || 'free';
		let usage = Math.round((data && data.total_usage_percentage) || 0);

		// Capitalised for display without a separate translation entry per
		// case, and safely for a right-to-left or non-Latin translation too:
		// toUpperCase() on a character with no case is a no-op, not a mangle.
		let plan_translated = __(plan_raw);
		let plan_label = plan_translated.charAt(0).toUpperCase() + plan_translated.slice(1);

		// Usage takes priority over plan tier: a customer about to be refused
		// requests needs the warning colour whatever plan they are on.
		badge.removeClass('plan-tier-plus plan-tier-pro plan-tier-ultra plan-usage-warn plan-usage-danger');
		if (usage >= 90) {
			badge.addClass('plan-usage-danger');
		} else if (usage >= 70) {
			badge.addClass('plan-usage-warn');
		} else if (plan_raw === 'plus' || plan_raw === 'pro' || plan_raw === 'ultra') {
			badge.addClass(`plan-tier-${plan_raw}`);
		}

		// .text(), not .html(): `plan` reaches here from the agent server's own
		// JSON response (get_user_usage), never a trusted constant.
		badge.text(`${plan_label} · ${usage}%`);
		badge.attr('title', __('{0} plan — {1}% of your monthly allowance used. Click to open Agent Settings.', [plan_label, usage]));
	}

	async logout_agent() {
		frappe.dom.freeze(__('Logging out...'));
		try {
			let agent_email = localStorage.getItem('connected_agent_email');
			await frappe.xcall(
				'accountant_agent.accountant_agent.page.agent_chat.agent_chat.disconnect_agent',
				{ agent_email: agent_email }
			);
			this.connected = false;
			this.connected_email = null;
			localStorage.removeItem('connected_agent_email');
			this.session_manager.session_id = null;
			await this.init();
			frappe.show_alert({ message: __('Logged out successfully!'), indicator: 'green' });
		} catch (e) {
			console.error("Logout error:", e);
		} finally {
			frappe.dom.unfreeze();
		}
	}

	// `before_delete` runs only once the customer has actually confirmed —
	// never on the initial click — so a caller that opened this from its own
	// dialog (the Settings gear) can dismiss that dialog at the same moment
	// the deletion itself starts, and not a moment before.
	confirm_delete_account(before_delete) {
		frappe.confirm(
			__('Are you sure you want to permanently delete your agent account?'),
			async () => {
				if (typeof before_delete === 'function') before_delete();
				frappe.dom.freeze(__('Deleting account...'));
				try {
					let agent_email = localStorage.getItem('connected_agent_email');
					await frappe.xcall(
						'accountant_agent.accountant_agent.page.agent_chat.agent_chat.delete_agent_account',
						{ agent_email: agent_email }
					);
					this.connected = false;
					this.connected_email = null;
					localStorage.removeItem('connected_agent_email');
					this.session_manager.session_id = null;
					await this.init();
					frappe.show_alert({ message: __('Account deleted successfully!'), indicator: 'green' });
				} catch (e) {
					console.error("Delete account error:", e);
				} finally {
					frappe.dom.unfreeze();
				}
			}
		);
	}

	start_stream_timer(session_id) {
		let stream = this.active_streams[session_id];
		if (!stream) return;
		if (stream.timer_interval) clearInterval(stream.timer_interval);

		stream.start_time = Date.now();
		stream.elapsed_seconds = 0;
		stream.timer_interval = setInterval(() => {
			if (!this.active_streams || !this.active_streams[session_id]) {
				clearInterval(stream.timer_interval);
				return;
			}
			let elapsed = Math.round((Date.now() - stream.start_time) / 1000);
			stream.elapsed_seconds = elapsed;

			if (session_id === this.session_manager.session_id) {
				this.ui_manager.update_thinking_duration(this.msg_box, stream.bubble_id, elapsed);
			}
		}, 1000);
	}

	stop_stream_timer(session_id) {
		if (this.active_streams && this.active_streams[session_id]) {
			let stream = this.active_streams[session_id];
			if (stream.timer_interval) {
				clearInterval(stream.timer_interval);
				stream.timer_interval = null;
			}
		}
	}

	generate_uuid() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	// One home for the "new stream, or the one already running" check that
	// every realtime handler above used to repeat inline — six copies of the
	// same six-field object literal, each free to drift from the others.
	ensure_stream(session_id) {
		this.active_streams = this.active_streams || {};
		if (!this.active_streams[session_id]) {
			this.active_streams[session_id] = {
				bubble_id: `stream-${this.generate_uuid()}`,
				accumulated: "",
				reasoning: "",
				steps: [],
				status: "",
				// Which desk answered — set from the `agent` field every
				// backend event now carries (stream_adapter.py stamps it on
				// every event, named desk or auto-routed). Live-session only:
				// nothing here is persisted, so a reload loses it exactly
				// like it loses the steps list.
				current_agent: null,
				start_time: Date.now(),
				elapsed_seconds: 0
			};
			this.start_stream_timer(session_id);
		}
		return this.active_streams[session_id];
	}

	// A big task can run the same tool five times in a row (five DB queries,
	// five schema reads). The old dedupe compared a new step against EVERY
	// step ever seen, so all five collapsed into one line and the run looked
	// stuck after the first. This instead only ever merges into the step
	// immediately before it, and counts instead of hiding the repeat.
	push_step(stream, name, type) {
		let last = stream.steps[stream.steps.length - 1];
		if (last && last.name === name && last.type === type) {
			last.count = (last.count || 1) + 1;
		} else {
			stream.steps.push({ name, type, count: 1 });
		}
	}

	// HAS THIS RUN STOPPED TO ASK THE CUSTOMER SOMETHING?
	//
	// Two independent signals, because they fail in different ways and the
	// wrong answer is visible: say "yes" wrongly and a finished checklist
	// stays on screen; say "no" wrongly and it vanishes from under the very
	// approval it is there to explain.
	//
	//   1. The run said so. The manager always publishes its checklist marked
	//      'paused' immediately before it hands the question over, so this is
	//      already known by the time the turn ends.
	//   2. The turn's last word IS the question — a plan waiting to be
	//      approved, or a set of questions waiting to be answered. True even
	//      if the checklist never reached this page.
	run_awaits_the_customer(run_status, response) {
		if (run_status === "paused") return true;
		if (!response) return false;

		let payload = response;
		if (typeof payload === "string") {
			let trimmed = payload.trim();
			if (!trimmed.startsWith("{")) return false;
			try {
				payload = JSON.parse(trimmed);
			} catch (e) {
				return false;
			}
		}
		if (!payload || typeof payload !== "object") return false;

		if (payload.type === "clarification") return true;
		return payload.type === "plan" && (payload.status || "pending") === "pending";
	}

	// Human name for a desk key, for the live badge and the hand-off lines.
	agent_display_name(agent_key) {
		if (!agent_key) return __("Razyyn");
		// Everyone the agent server streams under, with the name they go by in
		// the firm. "master" is the manager who reads the request, decides who
		// does what and writes back with the answer — a FINANCE MANAGER. It
		// used to read "Router", which is a name for a piece of plumbing: no
		// client of an accounting firm is told their books are with a router.
		// Own-property check because `agent_key` is untrusted (see below), and
		// a plain lookup on "constructor" or "toString" returns a function.
		let known = {
			master: __("Finance Manager"),
			router: __("Finance Manager"),
			helper: __("Assistant"),
			consultant: __("Advisory Board"),
			ask: __("Ask Agent"),
			analyse: __("Analyse Agent"),
			audit: __("Audit Agent"),
			reconcile: __("Reconciliation Agent"),
			create: __("Creator Agent"),
			update: __("Update Agent"),
		};
		if (Object.prototype.hasOwnProperty.call(known, agent_key)) return known[agent_key];
		// Every caller of this function drops the return value straight into
		// a template literal that ends up in .html()/.append()/.replaceWith()
		// (chat_ui_manager.js thinking-agent-badge and step list). An
		// `agent_key` that isn't one of the known desks above is untrusted —
		// it comes off the realtime channel from the agent server — so this
		// fallback, unlike the trusted def.name/translated strings above it,
		// must not return it raw.
		return frappe.utils.escape_html(String(agent_key));
	}

	async load_active_banner() {
		try {
			let res = await frappe.xcall('accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_active_banner_message');
			let banner_text = res ? (res.message || res.banner) : null;
			if (banner_text) {
				this.render_header_banner(banner_text);
			} else {
				let banner_el = this.layout ? this.layout.find('#agent-header-banner') : null;
				if (banner_el && banner_el.length) banner_el.hide().empty();
			}
		} catch (err) {
			console.warn("Could not load active banner:", err);
		}
	}

	render_header_banner(message) {
		if (!this.layout) return;
		let banner_el = this.layout.find('#agent-header-banner');
		if (!banner_el.length) return;
		banner_el.html(`
			<div class="agent-banner-pill" title="${frappe.utils.escape_html(message)}">
				<i class="fa fa-bullhorn agent-banner-icon"></i>
				<span class="agent-banner-text">${frappe.utils.escape_html(message)}</span>
			</div>
		`).css('display', 'flex');
	}
}
