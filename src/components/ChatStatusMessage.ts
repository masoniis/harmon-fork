import { html } from "common-tags";

export default function ChatStatusMessage(
  type: "joined" | "left",
  username: string,
) {
  const hash = Bun.hash(
    JSON.stringify({ type, username, t: new Date() }),
  ).toString();
  return html`
    <div id="chat_status_message_${hash}" class="chat_status_message">
      <hr />
      <p class="chat_message_username"><b>${username}</b> ${type}</p>
    </div>
  `;
}
