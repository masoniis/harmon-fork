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
            const username = document.getElementById("username_value");
            if (content && username) {
              for (const p of content.getElementsByTagName("p")) {
                if (p && p.innerHTML.includes("@" + username.value)) {
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
