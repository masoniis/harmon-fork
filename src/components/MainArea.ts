import { html } from "common-tags";
import Username from "./Username";
import ChatInput from "./ChatInput";

export default function MainArea(
  stoken: string,
  username: string,
  messages: string,
) {
  return html`
    <div id="main_area">
      <div id="nav_area">
        <div id="future_content"></div>
        <div id="user_info">
          ${Username(username)}
          <p id="ws_status">Connecting...</p>
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
