import { html } from "common-tags";
import moment from "moment";

export default function ChatMessage(
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
      <div class="chat_message_content" hx-disable>${content}</div>
      <script>
        {
          const ts = document.getElementById("chat_message_ts_${hash}");
          const value = ts.querySelector("input").value;
          const span = ts.querySelector("span");
          onVisible(ts, () => (span.innerHTML = displayTime(value)));
        }
      </script>
    </div>
  `;
}
