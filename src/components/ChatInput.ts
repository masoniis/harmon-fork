import { html } from "common-tags";

export default function ChatInput() {
  return html`
    <textarea
      autofocus
      id="new_message"
      name="new_message"
      onkeydown="handleNewMessageEnter(event)"
    ></textarea>
  `;
}
