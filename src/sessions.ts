import crypto from "node:crypto";
import db from "./db";

const registeredTokens = new Set();
const sessions: Record<string, string> = {};

async function randomLoginToken() {
	return crypto.randomBytes(48).toString("hex");
}

async function randomUsername() {
	return `user${crypto.randomBytes(10).toString("hex")}`;
}

async function randomSessionToken(token: string) {
	return Bun.hash(
		`${token}${crypto.randomBytes(16).toString("hex")}`,
	).toString();
}

export default {
	/**
	 * Generate a new random login token and save it for registration.
	 */
	async register() {
		const token = await randomLoginToken();
		registeredTokens.add(token);
		return token;
	},

	/**
	 * Validate a login token and return a session token, registering a new user if applicable.
	 */
	async login(token: string) {
		if (!(await db.read("username", token))) {
			if (!registeredTokens.has(token)) return;
			const username = await randomUsername();
			await db.write("token", username, token);
			await db.write("username", token, username);
			registeredTokens.delete(token);
		}
		const stoken = await randomSessionToken(token);
		sessions[stoken] = token;
		return stoken;
	},

	/**
	 * Exchange a valid session token for a new one, invalidating the old one.
	 */
	async nextSessionToken(stoken: string) {
		if (!sessions[stoken]) return;
		const token = sessions[stoken];
		const nextStoken = await randomSessionToken(token);
		sessions[nextStoken] = token;
		delete sessions[stoken];
		return nextStoken;
	},

	getLoginToken(stoken: string) {
		if (!sessions[stoken]) return;
		return sessions[stoken];
	},

	delete(stoken?: string) {
		if (!stoken || !sessions[stoken]) return;
		delete sessions[stoken];
	},
};
