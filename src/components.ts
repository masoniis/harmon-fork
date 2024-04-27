import { html } from "common-tags";
import moment from "moment";

export function MainArea(
  stoken: string,
  username: string,
  presence: Presence,
  messages: string,
  users: string,
) {
  return html`
    <div id="main_area">
      <div id="nav_area">
        <div id="users">${users}</div>
        <hr />
        <div id="my_user_info">
          <b id="username" onclick="editUsername()">${username}</b>
          <input
            id="new_username"
            type="text"
            hidden
            value="${username}"
            onkeydown="newUsername(event)"
          />
          <span id="my_user_presence_status">
            ${UserPresence(username, presence)}
            <p id="ws_status">Connecting...</p>
          </span>
        </div>
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
  return html`
    <span
      id="user_presence_${username}"
      class="user_presence_icon user_presence_${presence}"
    ></span>
  `;
}

export function UserStatus(username: string, status: string) {
  return html`
    <span id="user_status_${username}" class="user_status">${status}</span>
  `;
}

export function User(username: string, presence: Presence, status: string) {
  return html`
    <div id="user_${username}" class="user">
      ${UserPresence(username, presence)}
      <span class="user_username_status">
        <b>${username}</b>
        ${UserStatus(username, status)}
      </span>
    </div>
  `;
}
