import { html } from "common-tags";

export default function ChatMessage(
  content: string,
  username: string,
  hideUsername: boolean,
) {
  const hash = Bun.hash(
    JSON.stringify({ content, username, t: new Date() }),
  ).toString();
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
