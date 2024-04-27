import { cwd } from "node:process";
import { mkdir } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { html } from "common-tags";
import { Converter } from "showdown";
import xss from "xss";
import {
	Router,
	error,
	withContent,
	withParams,
	html as ittyHtml,
} from "itty-router";
import sessions from "./sessions";
import db from "./db";
import moment from "moment";
import type { ServerWebSocket } from "bun";
import {
	ChatInput,
	ChatMessage,
	MainArea,
	MyUserInfo,
	User,
	UserPresence,
	UserStatus,
	type Presence,
} from "./components";

const dataDir = process.env.DATA_DIR ?? `${cwd()}/data`;
const chatHistoryFile =
	process.env.CHAT_HISTORY_FILE ?? `${dataDir}/chat_history`;

/*
 * Download client-side JS libraries
 */

const jsDir = `${dataDir}/js`;
await mkdir(jsDir, { recursive: true });
const jsUrls = [
	"https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js",
	"https://unpkg.com/htmx.org@1.9.12/dist/ext/ws.js",
	"https://unpkg.com/moment@2.30.1/moment.js",
];
jsUrls.map(async (url) => {
	Bun.write(
		`${jsDir}/${url.split("/").at(-1)}`,
		await (await fetch(url)).text(),
	);
});
const jsPaths = jsUrls.map((url) => url.split("/").at(-1));

/*
 * Cache user status
 */

interface UserStats {
	username: string;
	presence: Presence;
	status: string;
	lastActive: moment.Moment;
	banner?: string;
}
const stats: Record<string, UserStats> = {};

// for (let i = 0; i < 100; i++) {
//   stats[`user${i}`] = {
//     username: `user${i}`,
//     presence: "chatting",
//     status: "chatting",
//     lastActive: moment(),
//   };
// }

let users = "";
function refreshUsers() {
	users = Object.values(stats)
		.sort((a, b) => {
			if (a.presence !== b.presence) {
				if (a.presence === "offline") return 1;
				if (b.presence === "offline") return -1;
			}
			return a.username.localeCompare(b.username);
		})
		.map((u) => User(u.username, u.presence, u.status, u.banner))
		.join("");
}

const awayDuration = moment.duration(10, "minutes").asMilliseconds();
function setInactive(token: string) {
	if (stats[token] || stats[token].presence === "offline") return;
	if (moment().diff(stats[token].lastActive) > awayDuration) {
		stats[token].presence = "inactive";
		stats[token].status = "inactive";
		server.publish(topic, UserPresence(stats[token].username, "inactive"));
		server.publish(topic, UserStatus(stats[token].username, "inactive"));
		refreshUsers();
	}
}

/*
 * Establish routes
 */

const router = Router({
	before: [withParams, withContent],
	catch: error,
	finally: [ittyHtml],
});

router
	.post("/login", async (req) => {
		const invalid = new Response("Invalid token!", {
			headers: { "HX-Retarget": "#login_error" },
		});

		const data = await req.formData();
		const token = data.get("token")?.toString();
		if (!token) return invalid;
		const stoken = await sessions.login(token);
		if (!stoken) return invalid;
		const username = await db.read("username", token);
		if (!username) return invalid;
		const banner = await db.read("banner", token);

		const chatHistory = Bun.file(chatHistoryFile);
		const messages = (await chatHistory.exists())
			? await chatHistory.text()
			: "";

		return new Response(
			MainArea(stoken, username, "chatting", messages, users, banner),
		);
	})
	.post(
		"/register",
		async () =>
			new Response(
				html`<a id="register_link"
					>Your token is ${await sessions.register()}</a
				>`,
			),
	)
	.get("/", () => new Response(Bun.file(`${import.meta.dir}/index.html`)))
	.get(
		"/index.css",
		() => new Response(Bun.file(`${import.meta.dir}/index.css`)),
	)
	.all("/js/:file", ({ file }) => {
		if (jsPaths.includes(file)) {
			return new Response(Bun.file(`${jsDir}/${file}`));
		}
	});

/*
 * Start server and handle WebSocket connections
 */

const topic = "chat_room";
let prevMessageUsername = "";
let prevMessageTime = moment();

interface ServerData {
	stoken?: string;
	token?: string;
	username?: string;
	banner?: string;
}
let connections: ServerWebSocket<ServerData>[] = [];

let connectionCount: Record<string, number> = {};

function info(ws: ServerWebSocket<ServerData>, msg: string) {
	console.info(
		`${moment()}\t${ws.data?.token?.substring(0, 10)}\t${ws.data?.username}${" ".repeat(24 - (ws.data?.username?.length ?? 0))}\t${msg}`,
	);
}

const server = Bun.serve<ServerData>({
	port: process.env.PORT ?? 3000,
	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/chat") {
			return server.upgrade(req, { data: {} })
				? undefined
				: new Response("Websocket upgrade error", { status: 400 });
		}
		return router.fetch(req);
	},
	websocket: {
		async message(ws, message) {
			let msg;
			try {
				msg = JSON.parse(message.toString());
			} catch (e) {
				return;
			}
			if (!msg.stoken) return;
			ws.data.token ??= sessions.getLoginToken(msg.stoken);
			if (
				!ws.data.token ||
				ws.data.token !== sessions.getLoginToken(msg.stoken)
			)
				return;
			ws.data.stoken = await sessions.nextSessionToken(msg.stoken);
			ws.sendText(
				JSON.stringify({ stoken: ws.data.stoken, username: ws.data.username }),
			);
			ws.data.username ??= await db.read("username", ws.data.token);
			if (!ws.data.username) return;
			ws.data.banner ??= await db.read("banner", ws.data.token);

			if (msg.first_load) {
				info(ws, "first_load");
				connections.push(ws);
				connectionCount[ws.data.token] =
					(connectionCount[ws.data.token] ?? 0) + 1;
				ws.subscribe(topic);
				const updateOnly =
					stats[ws.data.token] && stats[ws.data.token].presence !== "offline";
				stats[ws.data.token] = {
					username: ws.data.username,
					status: "chatting",
					presence: "chatting",
					lastActive: moment(),
					banner: ws.data.banner,
				};
				setTimeout(() => setInactive(ws.data.token!), awayDuration);
				refreshUsers();
				if (updateOnly) {
					server.publish(
						topic,
						UserPresence(ws.data.username, stats[ws.data.token].presence),
					);
					server.publish(
						topic,
						UserStatus(ws.data.username, stats[ws.data.token].status),
					);
					return;
				}
				server.publish(topic, html` <div id="users">${users}</div> `);
				return;
			}

			if (
				msg.new_message &&
				msg.new_message.length > 0 &&
				msg.new_message.trim().length > 0
			) {
				info(ws, `new_message\t${msg.new_message}`);
				const content = xss(
					new Converter({
						simpleLineBreaks: true,
						emoji: true,
						ghCodeBlocks: true,
					}).makeHtml(Bun.escapeHTML(msg.new_message)),
				);
				const chatMessage = ChatMessage(
					content,
					ws.data.username,
					prevMessageUsername === ws.data.username &&
						moment().diff(prevMessageTime) <=
							moment.duration(2, "minute").asMilliseconds(),
				);
				server.publish(
					topic,
					html`
						<div id="chat_messages" hx-swap-oob="beforeend">${chatMessage}</div>
					`,
				);
				ws.sendText(ChatInput());
				prevMessageTime = moment();
				prevMessageUsername = ws.data.username;
				await appendFile(chatHistoryFile, chatMessage);
				if (stats[ws.data.token]) {
					stats[ws.data.token].presence = "chatting";
					stats[ws.data.token].status = "chatting";
					stats[ws.data.token].lastActive = moment();
					setTimeout(() => setInactive(ws.data.token!), awayDuration);
				}
				server.publish(topic, UserPresence(ws.data.username, "chatting"));
				refreshUsers();
				return;
			}

			if (msg.new_username && msg.new_username.length > 0) {
				info(ws, `new_username\t${msg.new_username}`);
				const u = msg.new_username;
				if (u === ws.data.username) {
					ws.sendText(
						JSON.stringify({
							new_username_success: u,
						}),
					);
					return;
				}
				if (
					u.length >= 3 &&
					u.length <= 24 &&
					xss(Bun.escapeHTML(u)) === u &&
					!(await db.read("token", u))
				) {
					await db.write("token", u, ws.data.token);
					await db.write("username", ws.data.token, u);
					await db.delete("token", ws.data.username);
					if (stats[ws.data.token]) {
						stats[ws.data.token].username = u;
						stats[ws.data.token].presence = "chatting";
						stats[ws.data.token].status = "chatting";
						stats[ws.data.token].lastActive = moment();
						setTimeout(() => setInactive(ws.data.token!), awayDuration);
						refreshUsers();
						server.publish(topic, html` <div id="users">${users}</div> `);
					}
					for (const conn of connections) {
						if (conn.data.token === ws.data.token) {
							conn.data.username = u;
							conn.sendText(
								JSON.stringify({
									new_username_success: u,
								}),
							);
						}
					}
					return;
				}
			}

			if (msg.new_banner && msg.new_banner.length > 0) {
				info(ws, `new_banner\t${msg.new_banner}`);
				const b = msg.new_banner;
				if (b === ws.data.banner) {
					ws.sendText(
						JSON.stringify({
							new_banner_success: b,
						}),
					);
					return;
				}
				if (xss(Bun.escapeHTML(b)) === b) {
					await db.write("banner", ws.data.token, b);
					if (stats[ws.data.token]) {
						stats[ws.data.token].banner = b;
						stats[ws.data.token].presence = "chatting";
						stats[ws.data.token].status = "chatting";
						stats[ws.data.token].lastActive = moment();
						setTimeout(() => setInactive(ws.data.token!), awayDuration);
						refreshUsers();
						server.publish(topic, html` <div id="users">${users}</div> `);
					}
					for (const conn of connections) {
						if (conn.data.token === ws.data.token) {
							conn.data.banner = b;
							conn.sendText(
								JSON.stringify({
									new_banner_success: b,
								}),
							);
							conn.sendText(
								MyUserInfo(ws.data.username, stats[ws.data.token].presence, b),
							);
						}
					}
				}
				return;
			}
		},
		async close(ws) {
			if (ws.data.stoken) {
				sessions.delete(ws.data.stoken);

				connections = connections.filter(
					(c) => c.data.stoken !== ws.data.stoken,
				);
			}

			if (ws.data.token) {
				if (connectionCount[ws.data.token]) {
					if (connectionCount[ws.data.token] === 1) {
						delete connectionCount[ws.data.token];
					} else {
						connectionCount[ws.data.token]--;
					}
				}
				if (!connectionCount[ws.data.token]) {
					if (stats[ws.data.token]) {
						stats[ws.data.token].presence = "offline";
						stats[ws.data.token].status = "offline";
						refreshUsers();
						server.publish(topic, html` <div id="users">${users}</div> `);
					}
				}
			}
		},
	},
});
