import { html } from "common-tags";
import ChatInput from "./ChatInput";
import MyUserInfo from "./MyUserInfo";
import type { Presence } from "./UserPresence";

export default function MainArea(
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
        ${MyUserInfo(username, presence)}
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
