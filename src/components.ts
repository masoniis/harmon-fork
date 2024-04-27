import { html } from "common-tags";
import moment from "moment";

export function MainArea(
	stoken: string,
	username: string,
	presence: Presence,
	status: string,
	messages: string,
	users: string,
	banner?: string,
) {
	return html`
		<div id="main_area">
			<div id="nav_area">
				<div id="users">${users}</div>
				<hr />
				${MyUserInfo(username, presence, status, banner)}
			</div>
			<div id="chat_area" hx-ext="ws" ws-connect="/chat">
				<div id="notifications"></div>
				<div id="chat_messages">${messages}</div>
				<form id="chat_controls" ws-send>
					${ChatInput()}
					<input
						id="session_token"
						name="session_token"
						type="hidden"
						value="${stoken}"
					/>
					<button type="submit">Send</button>
				</form>
			</div>
		</div>
		${ChangeBannerDialog()}
	`;
}

export function MyUserInfo(
	username: string,
	presence: Presence,
	status: string,
	banner?: string,
) {
	return html`
		<div id="my_user_info" onclick="editBanner(event)">
			<span id="username_wrapper">
				<b
					id="username"
					onclick="editUser('username', event)"
					onmouseenter="showEditTip('username', true)"
					onmouseleave="showEditTip('username', false)"
					>${username}</b
				>
				<small id="username_edit_tip" class="edit_tip" hidden>edit</small>
			</span>
			<input
				id="new_username"
				type="text"
				hidden
				value="${username}"
				onkeydown="newUsername(event)"
			/>
			<span id="my_user_presence_status">
				${UserPresence(username, presence)}
				<p
					id="status"
					onclick="editUser('status', event)"
					onmouseenter="showEditTip('status', true)"
					onmouseleave="showEditTip('status', false)"
				>
					${status}
				</p>
				<small id="status_edit_tip" class="edit_tip" hidden>edit</small>
				<input
					id="new_status"
					type="text"
					hidden
					value="${status}"
					onkeydown="newStatus(event)"
				/>
			</span>
			${banner ? UserBannerStyle("my_user_info", banner) : ""}
		</div>
	`;
}

export function ChatMessage(
	content: string,
	username: string,
	hideUsername: boolean,
) {
	const ts = moment();
	const hash = Bun.hash(JSON.stringify({ content, username, ts })).toString();
	return html`
		<div id="chat_message_${hash}" class="chat_message">
			${hideUsername ? "" : html`<hr />`}
			<p ${hideUsername ? "hidden" : ""} class="chat_message_username">
				<b>${username}</b>
				<span id="chat_message_ts_${hash}" class="chat_message_ts">
					<input type="hidden" hidden value="${ts.toISOString()}" />
					<span></span>
				</span>
			</p>
			<div
				id="chat_message_${hash}_content"
				class="chat_message_content"
				hx-disable
			>
				${content}
			</div>
			<script>
				{
					const msg = document.getElementById("chat_message_${hash}");
					onVisible(msg, () => {
						const ts = document.getElementById("chat_message_ts_${hash}");
						if (ts) {
							ts.querySelector("span").innerHTML = displayTime(
								ts.querySelector("input").value,
							);
						}
						const content = document.getElementById(
							"chat_message_${hash}_content",
						);
						const username = document.getElementById("username").innerHTML;
						if (content && username) {
							for (const p of content.getElementsByTagName("p")) {
								if (p && p.innerHTML.includes("@" + username)) {
									content.setAttribute(
										"style",
										"background: var(--mention-bg-color)",
									);
									break;
								}
							}
						}
					});
				}
			</script>
		</div>
	`;
}

export function ChatInput() {
	return html`
		<textarea
			autofocus
			id="new_message"
			name="new_message"
			onkeydown="handleNewMessageEnter(event)"
		></textarea>
	`;
}

export function SessionToken(stoken: string) {
	return html` <input
		id="session_token"
		name="session_token"
		type="hidden"
		value="${stoken}"
		hx-swap-oob="true"
	/>`;
}

export type Presence = "chatting" | "inactive" | "offline";

export function UserPresence(username: string, presence: Presence) {
	const hash = Bun.hash(username).toString();
	return html`
		<span
			id="user_presence_${hash}"
			class="user_presence_icon user_presence_${presence}"
		></span>
	`;
}

export function UserStatus(username: string, status: string) {
	const hash = Bun.hash(username).toString();
	return html`
		<span id="user_status_${hash}" class="user_status">${status}</span>
	`;
}

export function User(
	username: string,
	presence: Presence,
	status: string,
	banner?: string,
) {
	const hash = Bun.hash(username).toString();
	return html`
		<div id="user_${hash}" class="user" style="">
			${UserPresence(username, presence)}
			<span class="user_username_status">
				<b>${username}</b>
				${UserStatus(username, status)}
			</span>
			${banner ? UserBannerStyle("user_" + hash, banner) : ""}
		</div>
	`;
}

export function UserBannerStyle(id: string, banner: string) {
	return html`
		<style>
			#${id} {
				background: linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.45)),
					url("${banner}");
				background-position: center;
				background-size: cover;
			}
		</style>
	`;
}

export function ChangeBannerDialog() {
	return html`
		<dialog id="new_banner_dialog">
			<div id="new_banner_dialog_contents">
				<button onclick="closeDialog('new_banner_dialog')">close</button>
				<label for="new_banner">URL of new banner image</label>
				<input
					id="new_banner"
					name="new_banner"
					type="text"
					autofocus
					onkeydown="newBanner(event)"
				/>
			</div>
		</dialog>
	`;
}
