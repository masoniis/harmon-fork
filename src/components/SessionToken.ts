import { html } from "common-tags";

export default function SessionToken(stoken: string) {
  return html` <input
    id="session_token"
    name="session_token"
    type="hidden"
    value="${stoken}"
    hx-swap-oob="true"
  />`;
}
