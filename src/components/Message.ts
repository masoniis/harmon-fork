import { html } from "common-tags";
import moment, { type Moment } from "moment";

const MessageInfo = (username: string, ts: Moment, hash: string) => html`
	<hr />
	<span id="msg_info_${hash}" class="message_info">
		<strong id="msg_username_${hash}" class="message_username"
			>${username}</strong
		>
		<span id="msg_ts_${hash}" class="message_ts"></span>
		<input class="message_ts_value" type="hidden" value="${ts.toISOString()}" />
	</span>
`;

export default function Message(
	content: string,
	username: string,
	showInfo: boolean,
) {
	const ts = moment();
	const hash = Bun.hash(JSON.stringify({ content, username, ts })).toString();
	return `
		<div id="msg_${hash}" class="message">
			${showInfo ? MessageInfo(username, ts, hash) : ""}
			<div id="msg_content_${hash}" class="message_content">${content}</div>
		</div>
	`;
}
