let loaded = false;
let voice = false;
let ws, stoken, myUserId, users, audioStream, iceServers, mediaTrackConstraints;

// TODO: unify this into one data structure
let peers = {};
let streams = {};
let analysers = {};
let RemoteAudio = {};
let peerUserIds = {};
let lastSpeakingChangeTime = {};

const SessionToken = document.querySelector("#session_token");
stoken = SessionToken.value;
SessionToken.remove();

const Messages = document.querySelector("#messages");
const MessageEditorContent = document.querySelector("#message_editor_content");
const MessageEditorSend = document.querySelector("#message_editor_send");
const MyUsername = document.querySelector("#my_username");
const MyUsernameEditor = document.querySelector("#my_username_editor");
const MyUsernameEditTip = document.querySelector("#my_username_edit_tip");
const MyPresence = document.querySelector("#my_presence");
const MyStatus = document.querySelector("#my_status");
const MyStatusEditor = document.querySelector("#my_status_editor");
const MyStatusEditTip = document.querySelector("#my_status_edit_tip");
const MySettings = document.querySelector("#my_settings");
const MySettingsEditTip = document.querySelector("#my_settings_edit_tip");
const Me = document.querySelector("#me");
const VoiceToggle = document.querySelector("#voice_toggle");
const Settings = document.querySelector("#settings");
const SettingsContent = document.querySelector("#settings_content");
const BannerUrl = document.querySelector("#banner_url");

const tsFormatOtherYear = "D MMM Y [at] h:mm a";
const tsFormat = "D MMM [at] h:mm a";
const msgInfoObserver = new IntersectionObserver((entries, observer) => {
	entries.forEach((entry) => {
		const { intersectionRatio, target } = entry;
		if (intersectionRatio > 0) {
			const tsValue = target.querySelector(".message_ts_value").value;
			const m = moment(tsValue);
			const isCurrentYear = m.year() === moment().year();
			const format = isCurrentYear ? tsFormat : tsFormatOtherYear;
			const time = m.calendar({
				sameDay: "h:mm a",
				lastDay: "ddd [at] h:mm a",
				lastWeek: format,
				sameElse: format,
			});
			target.querySelector(".message_ts").textContent = time;
			observer.disconnect();
		}
	});
});

const msgContentObserver = new IntersectionObserver((entries, observer) => {
	entries.forEach((entry) => {
		const { intersectionRatio, target } = entry;
		if (intersectionRatio > 0) {
			if (target.textContent.includes(`@${MyUsername.textContent}`)) {
				target.classList.add("mentioned");
				observer.disconnect();
			}
		}
	});
});

addEventListener("load", () => {
	for (const MessageInfo of document.querySelectorAll(".message_info")) {
		msgInfoObserver.observe(MessageInfo);
	}
	for (const MessageContent of document.querySelectorAll(".message_content")) {
		msgContentObserver.observe(MessageContent);
	}
});

function send(data) {
	ws.send(JSON.stringify({ stoken, ...data }));
}

ws = new WebSocket(
	(window.location.protocol === "https:" ? "wss://" : "ws://") +
		window.location.host +
		"/ws",
);
ws.addEventListener("open", send);
ws.addEventListener("close", () => {
	VoiceToggle.disabled = true;
	MessageEditorSend.disabled = true;
	MessageEditorContent.disabled = true;
	MyPresence.classList = "presence presence_error";
	MyStatus.textContent = "Connection Problem!";
});
ws.addEventListener("message", async (ev) => {
	let msg;
	try {
		msg = JSON.parse(ev.data);
	} catch (e) {
		return;
	}
	console.log(msg);

	if (msg.stoken) {
		VoiceToggle.disabled = false;
		MessageEditorSend.disabled = false;
		MessageEditorContent.disabled = false;
		if (!loaded) {
			MessageEditorContent.focus();
			Messages.scrollTop = Messages.scrollHeight;
			loaded = true;
		}
		stoken = msg.stoken;
	}

	if (msg.userId) {
		myUserId = msg.userId;
	}

	if (msg.iceServers) {
		iceServers = msg.iceServers;
	}

	if (msg.mediaTrackConstraints) {
		mediaTrackConstraints = msg.mediaTrackConstraints;
	}

	if (msg.newMessage) {
		const isScrolledToBottom =
			Messages.scrollHeight - Messages.clientHeight <= Messages.scrollTop + 1;

		Messages.insertAdjacentHTML("beforeend", msg.newMessage.message);

		if (isScrolledToBottom || msg.newMessage.userId === myUserId) {
			Messages.scrollTop = Messages.scrollHeight;
		}

		const MessageInfos = Messages.querySelectorAll(".message_info");
		if (MessageInfos.length) {
			const MessageInfo = MessageInfos[MessageInfos.length - 1];
			if (MessageInfo) msgInfoObserver.observe(MessageInfo);
		}
		const MessageContents = Messages.querySelectorAll(".message_content");
		if (MessageContents.length) {
			const MessageContent = MessageContents[MessageContents.length - 1];
			if (MessageContent) msgContentObserver.observe(MessageContent);
		}
	}

	if (msg.newUsername) {
		MyUsernameEditor.hidden = true;
		MyUsername.hidden = false;
		MyUsernameEditor.value = msg.newUsername;
	}

	if (msg.newStatus) {
		MyStatusEditor.hidden = true;
		MyStatus.hidden = false;
		MyStatusEditor.value = msg.newStatus;
	}

	if (msg.users) {
		users = msg.users;
		displayUsers();
	}

	if (msg.user) {
		// TODO: Implement fancy sorting algorithm to avoid re-rendering the entire user list
		let exists = false;
		for (const [i, user] of users.entries()) {
			if (user.id === msg.user.id) {
				users[i] = msg.user;
				exists = true;
				break;
			}
		}
		if (!exists) users.push(msg.user);
		displayUsers();
	}

	if (msg.peers) {
		for (const { peer, userId } of msg.peers) {
			peerUserIds[peer] = userId;
			peers[peer] = new RTCPeerConnection({ iceServers });
			setupPeerAudioConnection(peer);
			const offer = await peers[peer].createOffer();
			await peers[peer].setLocalDescription(offer);
			send({ action: "rtc_signal", peer, data: { offer } });
		}

		voice = "joined";
		VoiceToggle.classList.remove("voice_toggle_joining");
		VoiceToggle.classList.add("voice_toggle_leave");
		VoiceToggle.textContent = "Leave Voice";
	}

	if (msg.rtc_signal) {
		const { peer, userId, data } = msg.rtc_signal;
		if (data.offer) {
			peerUserIds[peer] = userId;
			peers[peer] = new RTCPeerConnection({ iceServers });
			setupPeerAudioConnection(peer);
			peers[peer].setRemoteDescription(new RTCSessionDescription(data.offer));
			const answer = await peers[peer].createAnswer();
			await peers[peer].setLocalDescription(answer);
			send({ action: "rtc_signal", peer, data: { answer } });
		}
		if (data.answer) {
			const remoteDesc = new RTCSessionDescription(data.answer);
			await peers[peer].setRemoteDescription(remoteDesc);
		}
		if (data.iceCandidate) {
			try {
				await peers[peer].addIceCandidate(data.iceCandidate);
			} catch (e) {
				console.error("Error adding received ice candidate", e);
			}
		}
	}

	if (msg.peerDisconnect) {
	}
});

/*
 * rtc audio functions
 */
function setSpeaking(peer, speaking) {
	const lastTime = lastSpeakingChangeTime[peer];
	if (speaking || !lastTime || moment().diff(lastTime, "millisecond") > 100) {
		lastSpeakingChangeTime[peer] = moment();
		const userId = peer === "me" ? myUserId : peerUserIds[peer];
		const TargetUser = document.querySelector(`#user_${userId}`);
		if (!TargetUser) return;
		if (speaking) {
			TargetUser.classList.add("speaking");
		} else {
			TargetUser.classList.remove("speaking");
		}
	}
}

function processAudioStream(peer, stream) {
	const context = new AudioContext();
	const source = context.createMediaStreamSource(stream);
	const analyser = context.createAnalyser();
	analyser.fftSize = 128;
	source.connect(analyser);
	const len = analyser.frequencyBinCount;
	const buf = new Uint8Array(len);
	function detectSpeaker() {
		analyser.getByteFrequencyData(buf);
		const avgVolume = buf.reduce((acc, cur) => acc + cur, 0) / len;
		setSpeaking(peer, avgVolume > 35);
		requestAnimationFrame(detectSpeaker);
	}
	detectSpeaker();
	streams[peer] = stream;
	analysers[peer] = analyser;
}

function setupPeerAudioConnection(peer) {
	RemoteAudio[peer] = new Audio();
	RemoteAudio[peer].id = `audio_${peer}`;
	RemoteAudio[peer].autoplay = true;
	document.body.appendChild(RemoteAudio[peer]);
	peers[peer].addEventListener("icecandidate", (event) => {
		if (event.candidate) {
			send({
				action: "rtc_signal",
				peer,
				data: { iceCandidate: event.candidate },
			});
		}
	});
	peers[peer].addEventListener("connectionstatechange", () => {
		if (peers[peer].connectionState === "connected") {
			console.log(`Connected to peer: ${peer}`);
		}
	});
	peers[peer].addEventListener("track", async (event) => {
		const [remoteStream] = event.streams;
		RemoteAudio[peer].srcObject = remoteStream;
		processAudioStream(peer, remoteStream);
	});
	audioStream
		.getTracks()
		.forEach((track) => peers[peer].addTrack(track, audioStream));
}

function deletePeer(peer) {
	streams[peer].getTracks().forEach((track) => track.stop());
	analysers[peer].disconnect();
	RemoteAudio[peer].remove();
	peers[peer].close();

	delete streams[peer];
	delete analysers[peer];
	delete RemoteAudio[peer];
	delete peers[peer];
	delete lastSpeakingChangeTime[peer];
}

/*
 * this is intended to keep the message view scrolled to the bottom when opening the keyboard on mobile
 */
new ResizeObserver(() => {
	const isScrolledToBottom =
		Messages.scrollHeight - Messages.clientHeight <= Messages.scrollTop + 600;
	if (isScrolledToBottom) {
		Messages.scrollTop = Messages.scrollHeight;
	}
}).observe(document.body);

/*
 * user list
 */
function sortUsers(users) {
	return users.sort((a, b) => a.username.localeCompare(b.username));
}

function setPresenceClasses(Presence, stats) {
	for (const stat in stats) {
		if (["in_call", "active", "inactive", "offline"].includes(stat)) {
			if (stats[stat]) {
				Presence.classList.add(`presence_${stat}`);
			} else {
				Presence.classList.remove(`presence_${stat}`);
			}
		}
	}
}

function UserGroup(title) {
	const UserGroupTemplate = document
		.querySelector("#user_group_template")
		.content.cloneNode(true);
	UserGroupTemplate.querySelector(".user_group_label").textContent = title;
	return UserGroupTemplate;
}

function User(user) {
	const { username, stats, status } = user;
	const UserTemplate = document
		.querySelector("#user_template")
		.content.cloneNode(true);

	UserTemplate.querySelector(".user").id = `user_${user.id}`;
	UserTemplate.querySelector(".username").textContent = username;

	const Status = UserTemplate.querySelector(".status");
	if (status.trim()) {
		Status.textContent = status.trim();
	} else {
		Status.innerHTML = "&nbsp;";
	}

	setPresenceClasses(UserTemplate.querySelector(".presence"), stats);

	UserTemplate.querySelector(".user").style.background =
		!stats.offline && user.banner
			? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.45)), url('${user.banner}')`
			: "";

	return UserTemplate;
}

function displayUsers() {
	const groups = {
		in_call: [],
		online: [],
		offline: [],
	};
	for (const user of users) {
		const { stats } = user;
		if (stats.in_call) {
			groups.in_call.push(user);
		} else if (stats.active || stats.inactive) {
			groups.online.push(user);
		} else {
			groups.offline.push(user);
		}
	}
	const Users = [];
	for (const g of ["in_call", "online", "offline"]) {
		if (groups[g].length) {
			groups[g] = sortUsers(groups[g]);
			Users.push(UserGroup(g.replace("_", " ")));
			for (const user of groups[g]) {
				Users.push(User(user));
				if (user.id === myUserId) {
					const { username, stats, status } = user;
					document.querySelector("#my_username").textContent = username;
					MyUsernameEditor.value = username;

					if (status.trim()) {
						MyStatus.textContent = status.trim();
					} else {
						MyStatus.innerHTML = "&nbsp;";
					}
					MyStatusEditor.value = status;

					setPresenceClasses(MyPresence, stats);

					BannerUrl.value = user.banner;
					Me.style.background = user.banner
						? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.45)), url('${user.banner}')`
						: "";
				}
			}
		}
	}
	document.querySelector("#users").replaceChildren(...Users);
}

/*
 * action: new_message
 */
function newMessage() {
	send({
		action: "new_message",
		data: { content: MessageEditorContent.value },
	});
	MessageEditorContent.value = "";
	MessageEditorContent.focus();
}
MessageEditorContent.addEventListener("keydown", (ev) => {
	if (ev.keyCode === 13 && !ev.shiftKey) {
		ev.preventDefault();
		newMessage();
	}
});
document
	.querySelector("#message_editor_send")
	.addEventListener("click", newMessage);

/*
 * action: edit_username
 */
function editUsername() {
	send({
		action: "edit_username",
		data: { username: MyUsernameEditor.value },
	});
}
MyUsername.addEventListener("mouseenter", () => {
	MyUsernameEditTip.hidden = false;
});
MyUsername.addEventListener("mouseleave", () => {
	MyUsernameEditTip.hidden = true;
});
MyUsername.addEventListener("click", () => {
	MyUsername.hidden = true;
	MyUsernameEditor.hidden = false;
	MyUsernameEditor.focus();
	MyUsernameEditor.select();
});
MyUsernameEditor.addEventListener("keydown", (ev) => {
	if (ev.keyCode === 13) {
		ev.preventDefault();
		editUsername();
	}
});

/*
 * action: edit_status
 */
function editStatus() {
	send({
		action: "edit_status",
		data: { status: MyStatusEditor.value },
	});
}
MyStatus.addEventListener("mouseenter", () => {
	MyStatusEditTip.hidden = false;
});
MyStatus.addEventListener("mouseleave", () => {
	MyStatusEditTip.hidden = true;
});
MyStatus.addEventListener("click", () => {
	MyStatus.hidden = true;
	MyStatusEditor.hidden = false;
	MyStatusEditor.focus();
	MyStatusEditor.select();
});
MyStatusEditor.addEventListener("keydown", (ev) => {
	if (ev.keyCode === 13) {
		ev.preventDefault();
		editStatus();
	}
});

/*
 * action: edit_settings
 */
MySettings.addEventListener("mouseenter", () => {
	MySettingsEditTip.classList.remove("invisible");
});
MySettings.addEventListener("mouseleave", () => {
	MySettingsEditTip.classList.add("invisible");
});
MySettings.addEventListener("click", () => {
	Settings.showModal();
});
Settings.addEventListener("click", () => {
	Settings.close();
});
SettingsContent.addEventListener("click", (ev) => {
	ev.stopPropagation();
});
Settings.addEventListener("close", () => {
	send({
		action: "edit_settings",
		data: {
			settings: {
				banner: BannerUrl.value,
			},
		},
	});
});

/*
 * action: join voice
 */
VoiceToggle.addEventListener("click", async () => {
	if (!voice) {
		audioStream = await navigator.mediaDevices.getUserMedia(
			mediaTrackConstraints,
		);
		processAudioStream("me", audioStream);
		send({ action: "join_voice" });
		voice = "joining";
		VoiceToggle.textContent = "Joining Voice...";
		VoiceToggle.classList.add("voice_toggle_joining");
	} else if (voice === "joining" || voice === "joined") {
		for (const peer in peers) deletePeer(peer);
		audioStream.getTracks().forEach((track) => track.stop());
		send({ action: "leave_voice" });
		voice = false;
		VoiceToggle.classList.remove("voice_toggle_joining");
		VoiceToggle.classList.remove("voice_toggle_leave");
		VoiceToggle.textContent = "Join Voice";
	}
});
