import { html } from "common-tags";

export type Presence = "online" | "away" | "offline";

export default function UserPresence(username: string, presence: Presence) {
  return html`
    <span
      id="user_presence_${username}"
      class="user_presence_icon user_presence_${presence}"
    ></span>
  `;
}
