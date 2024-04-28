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
	UserListSeparator,
	UserPresence,
	UserStatus,
	type Presence,
} from "./components";
import { PeerServer } from "peer";

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
	"https://www.unpkg.com/peerjs@1.1.0/dist/peerjs.min.js",
	"https://www.unpkg.com/peerjs@1.1.0/dist/peerjs.min.js.map",
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

let users = "";
function refreshUsers() {
	users = "";
	const talking = Object.values(stats)
		.filter((s) => s.presence === "talking")
		.sort((a, b) => a.username.localeCompare(b.username))
		.map((u) => User(u.username, u.presence, u.status, u.banner))
		.join("");
	const other = Object.values(stats)
		.filter((s) => s.presence !== "talking")
		.sort((a, b) => {
			if (a.presence !== b.presence) {
				if (a.presence === "offline") return 1;
				if (b.presence === "offline") return -1;
			}
			return a.username.localeCompare(b.username);
		})
		.map((u) => User(u.username, u.presence, u.status, u.banner))
		.join("");
	if (talking.length > 0) {
		users += UserListSeparator("talking");
		users += talking;
	}
	users += UserListSeparator("chatting");
	users += other;
}

const awayDuration = moment.duration(10, "minutes").asMilliseconds();
function setInactive(token: string) {
	if (
		!stats[token] ||
		stats[token].presence === "offline" ||
		stats[token].presence === "talking"
	)
		return;
	if (moment().diff(stats[token].lastActive) > awayDuration) {
		stats[token].presence = "inactive";
		server.publish(topic, UserPresence(stats[token].username, "inactive"));
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
			MainArea(
				stoken,
				username,
				"offline",
				"connecting...",
				messages,
				users,
				banner,
			),
		);
	})
	.post("/register", async () => {
		const token = String(await sessions.register());
		return new Response(
			html`<a id="register_link">
				your token is
				<span id="register_token" onclick="copyToClipboard('${token}')"
					>${token}</span
				>
			</a>`,
		);
	})
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
	status?: string;
}
let connections: ServerWebSocket<ServerData>[] = [];
let peerIds: string[] = [];

let connectionCount: Record<string, number> = {};
let peerCount: Record<string, number> = {};

const peerServerConfig =
	process.env.PEER_SERVER_PROXIED === "true"
		? {
				port: parseInt(process.env.PEER_SERVER_PORT ?? "9000"),
				path: process.env.PEER_SERVER_PATH ?? "/",
				proxied: true,
			}
		: {
				port: parseInt(process.env.PEER_SERVER_PORT ?? "9000"),
				host: process.env.PEER_SERVER_HOST ?? "localhost",
				path: process.env.PEER_SERVER_PATH ?? "/",
			};

const peerClientConfig = {
	port: parseInt(
		process.env.PEER_PROXY_PORT ?? peerServerConfig.port.toString(),
	),
	host: peerServerConfig.host,
	path: peerServerConfig.path,
};

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
			ws.data.status ??= await db.read("status", ws.data.token);
			if (!ws.data.status) {
				ws.data.status = "chatting";
				await db.write("status", ws.data.token, ws.data.status);
			}

			if (msg.first_load) {
				info(ws, "first_load");
				ws.sendText(
					JSON.stringify({
						peer_client_config: peerClientConfig,
					}),
				);
				ws.sendText(
					JSON.stringify({
						new_status_success: ws.data.status,
					}),
				);
				connections.push(ws);
				connectionCount[ws.data.token] =
					(connectionCount[ws.data.token] ?? 0) + 1;
				ws.subscribe(topic);
				const updateOnly =
					stats[ws.data.token] && stats[ws.data.token].presence !== "offline";
				const presence = stats[ws.data.token]?.presence ?? "offline";
				stats[ws.data.token] = {
					username: ws.data.username,
					status: ws.data.status,
					presence: presence === "offline" ? "chatting" : presence,
					lastActive: moment(),
					banner: ws.data.banner,
				};
				setTimeout(() => setInactive(ws.data.token!), awayDuration);
				refreshUsers();
				server.publish(
					topic,
					UserPresence(ws.data.username, stats[ws.data.token].presence),
				);
				if (updateOnly) {
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
					if (stats[ws.data.token].presence !== "talking") {
						stats[ws.data.token].presence = "chatting";
					}
					stats[ws.data.token].lastActive = moment();
					setTimeout(() => setInactive(ws.data.token!), awayDuration);
				}
				server.publish(
					topic,
					UserPresence(
						ws.data.username,
						stats[ws.data.token]?.presence ?? "chatting",
					),
				);
				refreshUsers();
				return;
			}

			if (
				msg.new_username &&
				msg.new_username.length > 0 &&
				msg.new_username.trim().length > 0
			) {
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
					u.trim() === u &&
					!(await db.read("token", u))
				) {
					await db.write("token", u, ws.data.token);
					await db.write("username", ws.data.token, u);
					await db.delete("token", ws.data.username);
					if (stats[ws.data.token]) {
						stats[ws.data.token].username = u;
						if (stats[ws.data.token].presence !== "talking") {
							stats[ws.data.token].presence = "chatting";
						}
						stats[ws.data.token].lastActive = moment();
						setTimeout(() => setInactive(ws.data.token!), awayDuration);
						server.publish(
							topic,
							UserPresence(ws.data.username, stats[ws.data.token].presence),
						);
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

			if (
				msg.new_status &&
				msg.new_status.length > 0 &&
				msg.new_status.trim().length > 0
			) {
				info(ws, `new_status\t${msg.new_status}`);
				const s = msg.new_status;
				if (s === ws.data.status) {
					ws.sendText(
						JSON.stringify({
							new_status_success: s,
						}),
					);
				}
				if (s.length >= 1 && s.length <= 32 && xss(Bun.escapeHTML(s)) === s) {
					await db.write("status", ws.data.token, s);
					if (stats[ws.data.token]) {
						if (stats[ws.data.token].presence !== "talking") {
							stats[ws.data.token].presence = "chatting";
						}
						stats[ws.data.token].status = s;
						stats[ws.data.token].lastActive = moment();
						setTimeout(() => setInactive(ws.data.token!), awayDuration);
						server.publish(
							topic,
							UserPresence(ws.data.username, stats[ws.data.token].presence),
						);
						refreshUsers();
						server.publish(topic, html` <div id="users">${users}</div> `);
					}
					for (const conn of connections) {
						if (conn.data.token === ws.data.token) {
							conn.data.status = s;
							conn.sendText(
								JSON.stringify({
									new_status_success: s,
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
						if (stats[ws.data.token].presence !== "talking") {
							stats[ws.data.token].presence = "chatting";
						}
						stats[ws.data.token].lastActive = moment();
						setTimeout(() => setInactive(ws.data.token!), awayDuration);
						server.publish(
							topic,
							UserPresence(ws.data.username, stats[ws.data.token].presence),
						);
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
								MyUserInfo(
									ws.data.username,
									stats[ws.data.token].presence,
									stats[ws.data.token].status,
									b,
								),
							);
						}
					}
				}
				return;
			}

			if (msg.peer_id && msg.peer_id.length > 0) {
				info(ws, `peer_id\t${msg.peer_id}`);
				peerCount[ws.data.token] = (peerCount[ws.data.token] ?? 0) + 1;
				ws.sendText(
					JSON.stringify({
						peer_ids: peerIds,
					}),
				);
				peerIds.push(msg.peer_id);
				if (stats[ws.data.token]) {
					stats[ws.data.token].presence = "talking";
					server.publish(
						topic,
						UserPresence(ws.data.username, stats[ws.data.token].presence),
					);
					refreshUsers();
					server.publish(topic, html` <div id="users">${users}</div> `);
				}
				return;
			}

			if (msg.peer_leave && msg.peer_leave.length > 0) {
				info(ws, `peer_leave\t${msg.peer_leave}`);
				peerIds = peerIds.filter((id) => id !== msg.peer_leave);
				if (peerCount[ws.data.token]) {
					if (peerCount[ws.data.token] === 1) {
						delete peerCount[ws.data.token];
					} else {
						peerCount[ws.data.token]--;
					}
				}
				if (!peerCount[ws.data.token]) {
					if (stats[ws.data.token]) {
						stats[ws.data.token].presence = "chatting";
						server.publish(
							topic,
							UserPresence(ws.data.username, stats[ws.data.token].presence),
						);
						refreshUsers();
						server.publish(topic, html` <div id="users">${users}</div> `);
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
				if (peerCount[ws.data.token]) {
					if (peerCount[ws.data.token] === 1) {
						delete peerCount[ws.data.token];
					} else {
						peerCount[ws.data.token]--;
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

PeerServer(peerServerConfig);
