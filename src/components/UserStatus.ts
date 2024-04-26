import { html } from "common-tags";

export default function UserStatus(username: string, status: string) {
  return html`
    <span id="user_status_${username}" class="user_status">${status}</span>
  `;
}
