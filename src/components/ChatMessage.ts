import { html } from "common-tags";

export default function ChatMessage(
  content: string,
  hash: string,
  username: string,
  hideUsername: boolean,
) {
  return html`
    <div id="chat_message_${hash}" class="chat_message">
      ${hideUsername ? "" : html`<hr />`}
      <b ${hideUsername ? "hidden" : ""} class="chat_message_username"
        >${username}</b
      >
      <div class="chat_message_content" hx-disable>${content}</div>
    </div>
  `;
}
