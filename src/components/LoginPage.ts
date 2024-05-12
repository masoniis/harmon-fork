import { html } from "common-tags";
import Page from "./Page";

const ErrorMessage = (m: string) => html`<small>${m}</small>`;
const Token = (t: string) =>
	html`<span id="new_token_line"
		>Your token is <span id="new_token">${t}</span></span
	>`;
const Register = () => html`<a id="register" href="/register">Register</a>`;

export default function LoginPage(error = false, token = "") {
	return Page(html`
		<div id="login_page">
			<form id="login" action="/login" method="post">
				<label for="token">Login</label>
				<input id="token" name="password" type="password" autofocus />
				${error ? ErrorMessage("Invalid token!") : ""}
				${token ? Token(token) : Register()}
				<small id="token_copy_tip">${token ? "click to copy" : ""}</small>
			</form>
			<hr />
		</div>
		<script src="login.js"></script>
	`);
}
