import { html } from "common-tags";
import Username from "./Username";
import UserPresence, { type Presence } from "./UserPresence";

export default function MyUserInfo(username: string, presence: Presence) {
  return html`
    <div id="my_user_info">
      ${Username(username)}
      <span id="my_user_presence_status">
        ${UserPresence(username, presence)}
        <p id="ws_status">Connecting...</p>
      </span>
    </div>
  `;
}
