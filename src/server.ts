import crypto from "node:crypto";
import {
	Router,
	withContent,
	withParams,
	html as ittyHtml,
	error as ittyError,
} from "itty-router";
import sessions from "./sessions";
import db from "./db";
import AppPage from "./components/AppPage";
import LoginPage from "./components/LoginPage";
import type { SocketData, User } from "./types";
import constants from "./constants";
import moment, { type Moment } from "moment";
import type { ServerWebSocket } from "bun";
import Message from "./components/Message";
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

function log(token: string, user: User, msg: string) {
	console.log(
		`${moment()}\t${token.substring(0, 10)}\t${user.username}${" ".repeat(constants.maxUsernameLength - user.username.length)}\t${msg}`,
	);
}

const router = Router({
	before: [withParams, withContent],
	catch: ittyError,
	finally: [ittyHtml],
});

router
	.get("/", () => LoginPage())
	.post("/login", async (req) => {
		const data = await req.formData();
		const token = data.get("token")?.toString();
		if (token) {
			const stoken = await sessions.login(token);
			if (stoken) {
				const messages = await db.chat.read();
				return AppPage(stoken, messages).replaceAll(/\t/g, "");
			}
		}
		return LoginPage(true);
	})
	.get("/register", async () => {
		const token = await sessions.register();
		return LoginPage(false, token);
	})
	.all("/:path", ({ path }) => {
		return new Response(Bun.file(`${import.meta.dir}/static/${path}`));
	})
	.all("*", () => ittyError(404));

const server = Bun.serve<SocketData>({
	port: constants.port,
	fetch: (req, server) => {
		if (new URL(req.url).pathname === "/ws") {
			return server.upgrade(req)
				? undefined
				: new Response("WebSocket upgrade error", { status: 400 });
		}
		return router.fetch(req);
	},
	websocket: {
		message: onMessage,
		close: onClose,
	},
});

let lastUsername: {
	username: string;
	time: Moment;
};
let users: User[] = [];

// for (let i = 0; i < 100; i++) {
// 	users.push({
// 		id: "as",
// 		username: "john",
// 		stats: {},
// 		lastActive: moment(),
// 		status: "online",
// 		banner: "",
// 	});
// }

let sockets: Record<string, ServerWebSocket<SocketData>[]> = {};
let peers: Record<string, ServerWebSocket<SocketData>> = {};

function send(ws: ServerWebSocket<SocketData>, data: any) {
	ws.sendText(JSON.stringify(data));
}
function sub(ws: ServerWebSocket<SocketData>) {
	ws.subscribe("chat");
}
function pub(data: any) {
	server.publish("chat", JSON.stringify(data));
}

const inactiveTimeout = moment.duration(
	constants.inactiveTimeout,
	constants.inactiveTimeoutUnit,
);
function setInactive(userId: string) {
	const user = users.find((u) => u.id === userId);
	if (
		user &&
		!user.stats.offline &&
		moment().diff(user.lastActive) >= inactiveTimeout.asMilliseconds()
	) {
		user.stats.offline = false;
		user.stats.active = false;
		user.stats.inactive = true;
		pub({ user });
	}
}
function setActive(user: User) {
	user.stats.offline = false;
	user.stats.inactive = false;
	user.stats.active = true;
	user.lastActive = moment();
	setTimeout(() => setInactive(user.id), inactiveTimeout.asMilliseconds());
}

function leaveVoice(
	ws: ServerWebSocket<SocketData>,
	token: string,
	user: User,
) {
	if (!ws.data.peerId) return;
	pub({ peerDisconnect: ws.data.peerId });
	delete peers[ws.data.peerId];
	ws.data.peerId = undefined;
	let hasOtherCall = false;
	for (const socket of sockets[token]) {
		if (socket.data.peerId) {
			hasOtherCall = true;
			break;
		}
	}
	if (!hasOtherCall) {
		user.stats.in_call = false;
		pub({ user });
	}
}

async function onMessage(
	ws: ServerWebSocket<SocketData>,
	message: string | Buffer,
) {
	let msg;
	try {
		msg = JSON.parse(message.toString());
	} catch (e) {
		return;
	}

	let stoken = msg.stoken;
	if (!stoken) return;
	const token = sessions.getLoginToken(msg.stoken);
	if (!token) return;
	stoken = await sessions.nextSessionToken(msg.stoken);
	send(ws, { stoken });

	if (!ws.data) {
		let user: User;
		if (token in sockets && sockets[token].length) {
			user = sockets[token][0].data.user;
		} else {
			user = {
				id: (await db.read("id", token))!,
				username: (await db.read("username", token))!,
				stats: {},
				lastActive: moment(),
				status: await db.readOrWriteNew("status", token, "active"),
				banner: await db.readOrWriteNew("banner", token, ""),
			};
		}
		send(ws, { userId: user.id });
		ws.data = { token, stoken, user };
		sockets[token] = sockets[token] ? [...sockets[token], ws] : [ws];
		setActive(user);
		let exists = false;
		for (const [i, existing] of users.entries()) {
			if (existing.id === user.id) {
				users[i] = user;
				exists = true;
				break;
			}
		}
		if (!exists) users.push(user);
		send(ws, { users });
		pub({ user });
		sub(ws);
		send(ws, { iceServers: constants.iceServers });
		// TODO: Allow users to configure these
		send(ws, {
			mediaTrackConstraints: {
				audio: {
					noiseSuppression: true,
					autoGainControl: true,
				},
				video: false,
			},
		});
		log(token, user, "init");
	} else {
		ws.data.stoken = stoken;
	}
	if (!msg.action) return;

	const user = ws.data.user;

	if (msg.action === "new_message") {
		let { content } = msg.data;
		content = DOMPurify.sanitize(
			await marked(content, { gfm: true, breaks: true }),
		);
		if (content && content.length && content.trim().length) {
			const time = moment();
			const showUsername = lastUsername
				? lastUsername.username !== user.username ||
					time.diff(lastUsername.time) >
						moment.duration(2, "minute").asMilliseconds()
				: true;
			const newMessage = Message(content, user.username, showUsername);
			pub({ newMessage: { userId: user.id, message: newMessage } });
			if (showUsername) lastUsername = { username: user.username, time };
			const wasInactive = user.stats.inactive;
			setActive(user);
			if (wasInactive) {
				pub({ user });
			}
			await db.chat.append(newMessage);
			log(token, user, `new_message\t${content}`);
		}
	} else if (msg.action === "edit_username") {
		const { username } = msg.data;
		if (username === user.username) {
			send(ws, { newUsername: username });
		}
		if (
			constants.usernameValidationRegex.test(username) &&
			username.length >= constants.minUsernameLength &&
			username.length <= constants.maxUsernameLength &&
			!(await db.read("token", username))
		) {
			await db.write("token", username, token);
			await db.write("username", token, username);
			await db.delete("token", user.username);
			send(ws, { newUsername: username });
			user.username = username;
			setActive(user);
			pub({ user });
			log(token, user, `edit_username\t${username}`);
		}
	} else if (msg.action === "edit_status") {
		let { status } = msg.data;
		if (status === user.status) {
			send(ws, { newStatus: status });
		}
		status = DOMPurify.sanitize(Bun.escapeHTML(status));
		send(ws, { newStatus: status });
		user.status = status;
		setActive(user);
		pub({ user });
		await db.write("status", token, status);
		log(token, user, `edit_status\t${status}`);
	} else if (msg.action === "join_voice") {
		if (ws.data.peerId) return;
		ws.data.peerId = crypto.randomBytes(8).toString("hex");
		send(ws, {
			peers: Object.entries(peers).map(([peer, ws]) => ({
				peer,
				userId: ws.data.user.id,
			})),
		});
		peers[ws.data.peerId] = ws;
		user.stats.in_call = true;
		pub({ user });
		log(token, user, `join_voice\t${ws.data.peerId}`);
	} else if (msg.action === "leave_voice") {
		leaveVoice(ws, token, user);
		log(token, user, "leave_voice");
	} else if (msg.action === "rtc_signal") {
		if (!ws.data.peerId) return;
		const { peer, data } = msg;
		if (!data || !peer || !peers[peer]) return;
		send(peers[peer], {
			rtc_signal: { peer: ws.data.peerId, userId: ws.data.user.id, data },
		});
		log(
			token,
			user,
			`rtc_signal\t${JSON.stringify({ from: ws.data.peerId, to: peer, data })}`,
		);
	} else if (msg.action === "edit_settings") {
		let { settings } = msg.data;
		if (!settings) return;
		user.banner = settings.banner;
		pub({ user });
		await db.write("banner", token, settings.banner);
		log(token, user, `edit_settings\t${JSON.stringify(settings)}`);
	}
}

async function onClose(ws: ServerWebSocket<SocketData>) {
	if (!ws.data) return;
	const { token, stoken, user } = ws.data;
	leaveVoice(ws, token, user);
	if (sockets[token]) {
		sockets[token] = sockets[token].filter((s) => s.data.stoken !== stoken);
	}
	if (!sockets[token]?.length) {
		let offlineUser: User = {
			...user,
			stats: { offline: true },
			status: "offline",
			banner: "",
		};
		users = users.map((u) => (u.id === user.id ? offlineUser : u));
		pub({ user: offlineUser });
		delete sockets[token];
	}
	log(token, user, `close`);
}
