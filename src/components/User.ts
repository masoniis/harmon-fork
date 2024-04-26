import { html } from "common-tags";
import UserPresence from "./UserPresence";
import UserStatus from "./UserStatus";

export default function User(
  username: string,
  presence: "online" | "away" | "offline",
  status: string,
) {
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
