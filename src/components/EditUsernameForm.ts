import { html } from "common-tags";

export default function EditUsernameForm(username: string) {
  return html`
    <form
      hx-post="/set_username"
      hx-swap="outerHTML"
      hx-include="#session_token"
    >
      <input autofocus id="edit_username" name="username" value="${username}" />
    </form>
  `;
}
