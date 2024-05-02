import { html } from "common-tags";
import Page from "./Page";

// TODO: Add settings dialog

export default function AppPage(
	stoken: string,
	username: string,
	messages: string,
) {
	return Page(`
		<div id="sidebar">
			<div id="users"></div>
			<template id="user_group_template">
				<small class="user_group_label"></small>
			</template>
			<template id="user_template">
				<div class="user">
					<span class="presence"></span>
					<span class="username_status">
						<strong class="username">${username}</strong>
						<span class="status"></span>
					</span>
				</div>
			</template>
			<button id="voice_toggle" class="voice_toggle_on">
				Join Voice
			</button>
			<div id="me">
				<div id="my_user_info">
					<span id="my_username_line">
						<strong id="my_username" class="username"></strong>
						<small id="my_username_edit_tip" class="my_edit_tip" hidden
							>edit</small
						>
						<input id="my_username_editor" type="text" hidden />
					</span>
					<span id="my_stats">
						<span id="my_presence" class="presence"></span>
						<span id="my_status" class="status"></span>
						<small id="my_status_edit_tip" class="my_edit_tip" hidden
							>edit</small
						>
						<input id="my_status_editor" type="text" hidden />
					</span>
				</div>
				<div id="my_settings">
					<small id="my_settings_edit_tip" class="my_edit_tip invisible"
						>edit</small
					>
				</div>
			</div>
		</div>
		<main>
			<div id="messages">${messages}</div>
			<div id="message_editor">
				<textarea
					id="message_editor_content"
					name="message_editor_content"
				></textarea>
				<button id="message_editor_send">Send</button>
			</div>
		</main>
		<dialog id="settings">
			<div id="settings_content">
				<h3 id="settings_title">Settings</h3>
				<div class="settings_row">
					<label for="banner_url">Banner URL</label>
					<input id="banner_url" type="text" />
				</div>
				<div class="settings_row">
					<label for="chimes_toggle">Play chime on new messages</label>
					<input id="chimes_toggle" type="checkbox" />
				</div>
				<div class="settings_row">
					<label for="custom_css">Enter your custom CSS theme here:</label>
					<textarea id="custom_css" type="text" rows="5"></textarea>
				</div>
				<div class="settings_row">
					<label for="notifs_toggle">Show notification on new messages</label>
					<input id="notifs_toggle" type="checkbox" />
				</div>
			</div>
		</dialog>
		<input
			id="session_token"
			name="session_token"
			type="hidden"
			value="${stoken}"
		/>
		<script src="app.js"></script>
		<script src="https://unpkg.com/moment"></script>
	`);
}
