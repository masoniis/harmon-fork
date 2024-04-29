/*
 * copy token to clipboard
 */
document.querySelector("#new_token").addEventListener("click", (ev) => {
	navigator.clipboard.writeText(ev.target.textContent);
	document.querySelector("#token_copy_tip").textContent =
		"copied to clipboard!";
});
