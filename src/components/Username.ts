import { html } from "common-tags";

export default function Username(username: string) {
  return html`
    <b
      id="username"
      hx-post="/edit_username"
      hx-swap="outerHTML"
      hx-include="#username_value"
      hx-trigger="click"
      >${username}</b
    >
    <input
      id="username_value"
      name="username"
      type="hidden"
      hidden
      value="${username}"
    />
  `;
}
