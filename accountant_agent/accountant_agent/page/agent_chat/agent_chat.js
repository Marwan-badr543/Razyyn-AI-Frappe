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
 * The letter the mark stands in for. The mark takes that letter's place in the
 * name, so it reads as the first letter of the word rather than as an icon
 * sitting next to it.
 */
const RAZYYN_MARK_LETTER = 'R';

/**
 * Build the brand lockup in the page head: the mark, then the rest of the name.
 *
 * The title drops its leading "R" because the mark supplies it — together they
 * spell the name as one word. A translated name that does not begin with that
 * letter keeps all of its letters; the mark never chops a letter it is not
 * standing in for. The browser tab and the title tooltip keep the full name.
 *
 * The mark goes in as a *sibling* of `.title-text`, never a child: Frappe's
 * `page.set_title()` replaces that element's contents, which would silently
 * wipe a mark placed inside it. Re-running this is safe — the leading letter is
 * already gone and any previous mark is removed first — so a re-rendered header
 * never ends up with two marks or a shortened name.
 */
function render_brand_lockup(wrapper) {
	let title = $(wrapper).find('.title-area .title-text');
	let title_row = title.parent();
	let name = title.text();

	if (name.startsWith(RAZYYN_MARK_LETTER)) {
		title.text(name.slice(RAZYYN_MARK_LETTER.length));
	}

	title_row.addClass('agent-brand-lockup');
	title_row.find('.agent-brand-mark').remove();
	title_row.prepend(RAZYYN_BRAND_MARK);
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

	render_brand_lockup(wrapper);

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
					securityLevel: 'loose'
				});
			}
		};
		document.head.appendChild(script);
	}
	
	// Dynamically load Chart.js from CDN
	if (!window.Chart) {
		let script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js';
		document.head.appendChild(script);
	}

	// Dynamically load marked.js from CDN
	if (!window.marked) {
		let script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
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

	new AccountantAgentChat(wrapper, page);


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

		frappe.realtime.on("agent_message_chunk", (data) => {
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
				stream.accumulated += data.chunk;

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_bubble(this.msg_box, stream.bubble_id, stream.accumulated);
				}
			}
		});

		frappe.realtime.on("agent_message_reasoning", (data) => {
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
				stream.reasoning += data.chunk;

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_reasoning(this.msg_box, stream.bubble_id, stream.reasoning);
				}
			}
		});

		frappe.realtime.on("agent_node_start", (data) => {
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

				if (!stream.steps.some(s => s.name === display)) {
					stream.steps.push({ name: display, type: 'node' });
				}

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_status(this.msg_box, stream.bubble_id, display, stream.steps);
				}
			}
		});

		frappe.realtime.on("agent_tool_start", (data) => {
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

				if (!stream.steps.some(s => s.name === display)) {
					stream.steps.push({ name: display, type: 'tool' });
				}

				if (data.session_id === this.session_manager.session_id) {
					this.ui_manager.update_stream_status(this.msg_box, stream.bubble_id, display, stream.steps);
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
				if (this.message_handler.cancelled_sessions.has(data.session_id)) {
					this.message_handler.cancelled_sessions.delete(data.session_id);
					return;
				}
				this.stop_stream_timer(data.session_id);
				let active_session_id = this.session_manager.session_id;
				let header_title = __("Completed");

				if (this.active_streams && this.active_streams[data.session_id]) {
					let stream = this.active_streams[data.session_id];
					let duration = stream.elapsed_seconds || 0;
					if (stream.reasoning) {
						header_title = `${__("Thought for")} ${duration}s`;
					} else {
						header_title = `${__("Worked for")} ${duration}s`;
					}

					if (data.session_id === active_session_id) {
						this.ui_manager.finalize_stream_bubble(
							this.msg_box, 
							stream.bubble_id, 
							data.response, 
							new Date().toISOString(),
							header_title
						);
					}
					delete this.active_streams[data.session_id];
				}

				if (data.session_id === active_session_id) {
					this.ui_manager.hide_typing_indicator(this.msg_box);
					this.message_handler.set_button_state('send');
				}
				await this.session_manager.load_chats(false);
			}
		});

		frappe.realtime.on("agent_message_error", async (data) => {
			if (data && data.session_id) {
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
				<h3 class="text-center" style="margin-top: 0; margin-bottom: 20px; font-weight: 700; color: var(--chat-primary);">
					Razyyn
				</h3>
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
							<input type="text" id="auth-company" placeholder="e.g. My Company Corp">
						</div>
						
						<div class="form-group">
							<label for="auth-email">${__('Email Address')}</label>
							<input type="email" id="auth-email" placeholder="email@example.com" required>
						</div>
						
						<div class="form-group">
							<label for="auth-password">${__('Password')}</label>
							<input type="password" id="auth-password" placeholder="••••••••" required>
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
			} else {
				$card.find('.signup-field').slideUp(200);
				$card.find('.agent-auth-btn').text(__('Connect'));
			}
		});

		$card.find('#agent-auth-form').on('submit', async (e) => {
			e.preventDefault();

			let company_name = $card.find('#auth-company').val();
			let email = $card.find('#auth-email').val();
			let password = $card.find('#auth-password').val();

			frappe.dom.freeze(this.active_tab === 'login' ? __('Connecting...') : __('Creating Account...'));

			try {
				let res = await frappe.xcall(
					'accountant_agent.accountant_agent.page.agent_chat.agent_chat.authenticate_agent',
					{
						mode: this.active_tab,
						email: email,
						password: password,
						company_name: company_name
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
						<div class="agent-status-container">
							<div class="agent-status-badge">
								<div class="agent-status-dot"></div>
								${__('Connected:')} <a href="javascript:void(0)" class="agent-email-link" title="${__('Click to view Agent Settings')}"><strong>${this.connected_email}</strong> <i class="fa fa-cog" style="font-size: 11px; margin-left: 3px;"></i></a>
							</div>
						</div>
						<div class="agent-header-actions" style="display: flex; align-items: center; gap: 12px;">
							<select class="agent-lang-selector form-control" style="width: 100px; padding: 2px 6px; height: 28px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; background-color: var(--chat-card-bg); color: var(--chat-text); border: 1px solid var(--chat-border);">
								<option value="en" ${frappe.boot.lang === 'en' ? 'selected' : ''}>English</option>
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
					<div class="agent-messages-container" id="agent-msg-box"></div>
					
					<!-- Input Area -->
					<div class="agent-input-container">
						<div class="agent-clarification-popup" style="display: none;"></div>
						<div class="agent-input-card">
							<textarea class="agent-textarea" placeholder="${__('Type your financial question or query here...')}" id="agent-input-msg" maxlength="10000"></textarea>
							<div class="agent-input-footer">
								<div class="agent-input-footer-left"></div>
								<div class="agent-input-footer-right">
									<div class="agent-char-counter">0 / 10000</div>
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

		await this.session_manager.load_chats();
	}

	setup_chat_events() {
		this.layout.find('.agent-email-link').on('click', async (e) => {
			e.preventDefault();
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
		});

		this.sidebar.find('.new-chat-btn').on('click', () => {
			this.session_manager.set_new_chat_draft();
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
				frappe.dom.freeze(__('Logging out...'));
				try {
					let agent_email = localStorage.getItem('connected_agent_email');
					await frappe.xcall(
						'accountant_agent.accountant_agent.page.agent_chat.agent_chat.disconnect_agent',
						{ agent_email: agent_email }
					);
					self.connected = false;
					self.connected_email = null;
					localStorage.removeItem('connected_agent_email');
					self.session_manager.session_id = null;
					await self.init();
					frappe.show_alert({ message: __('Logged out successfully!'), indicator: 'green' });
				} catch (e) {
					console.error("Logout error:", e);
				} finally {
					frappe.dom.unfreeze();
				}
			});

			d.$wrapper.find('.delete-action-btn').on('click', () => {
				frappe.confirm(
					__('Are you sure you want to permanently delete your agent account?'),
					async () => {
						d.hide();
						frappe.dom.freeze(__('Deleting account...'));
						try {
							let agent_email = localStorage.getItem('connected_agent_email');
							await frappe.xcall(
								'accountant_agent.accountant_agent.page.agent_chat.agent_chat.delete_agent_account',
								{ agent_email: agent_email }
							);
							self.connected = false;
							self.connected_email = null;
							localStorage.removeItem('connected_agent_email');
							self.session_manager.session_id = null;
							await self.init();
							frappe.show_alert({ message: __('Account deleted successfully!'), indicator: 'green' });
						} catch (e) {
							console.error("Delete account error:", e);
						} finally {
							frappe.dom.unfreeze();
						}
					}
				);
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
				// While the manager is working the composer is closed and the
				// button is the cancel control, so Enter has nothing to send.
				let btn = this.layout.find('#agent-send-trigger');
				if (!btn.hasClass('agent-cancel-btn')) {
					this.message_handler.send_user_message();
				}
			}
		});

		this.layout.find('#agent-send-trigger').on('click', () => {
			let btn = this.layout.find('#agent-send-trigger');
			if (btn.hasClass('agent-cancel-btn')) {
				this.message_handler.cancel_agent_execution();
			} else {
				this.message_handler.send_user_message();
			}
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
}
