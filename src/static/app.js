let voice = false;
let ws,
	stoken,
	myUserId,
	users,
	audioStream,
	iceServers,
	mediaTrackConstraints,
	settings;
let focused = true;

let peers = {};

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
const ChimesToggle = document.querySelector("#chimes_toggle");
const CustomCss = document.querySelector("#custom_css");
const NotifsToggle = document.querySelector("#notifs_toggle");
const VoiceDecline = document.querySelector("#voice_decline");

let RingtoneAudio;

const MessageEditorQuill = new Quill("#message_editor_content", {
	theme: "bubble",
	modules: {
		toolbar: false, // TODO: Get this to work without weird overflow issues and more, allows for cool selecting of text to add bold, italic, etc.
	},
});

MessageEditorQuill.root.addEventListener("focus", () => {
	MessageEditorContent.classList.add("focused");
});

MessageEditorQuill.root.addEventListener("blur", () => {
	MessageEditorContent.classList.remove("focused");
});

const Style = document.createElement("style");
document.head.appendChild(Style);

addEventListener("focus", () => (focused = true));
addEventListener("blur", () => (focused = false));

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
			const u = MyUsername.textContent;
			const mentionRegex = new RegExp(
				`^@${u}$|^@${u}\\s+.*$|^.*\\s+@${u}\\s+.*|^.*\\s+@${u}$`,
				"sg",
			);
			if (mentionRegex.test(target.textContent)) {
				target.classList.add("mentioned");
				observer.disconnect();
			}
		}
	});
});

addEventListener("load", () => {
	Messages.scrollTop = Messages.scrollHeight;
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

	if (msg.myUserId) {
		myUserId = msg.myUserId;
	}

	if (msg.iceServers) {
		iceServers = msg.iceServers;
	}

	if (msg.mediaTrackConstraints) {
		mediaTrackConstraints = msg.mediaTrackConstraints;
	}

	if (msg.settings) {
		settings = msg.settings;
		const { chimes, customCss, notifs } = msg.settings;
		ChimesToggle.checked = chimes;
		CustomCss.value = customCss ? customCss : "";
		Style.innerHTML = customCss ? customCss : "";
		NotifsToggle.checked = notifs;
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
			if (MessageContent) {
				msgContentObserver.observe(MessageContent);
				if (NotifsToggle.checked && !focused) {
					new Notification(msg.newMessage.username, {
						body: MessageContent.textContent,
						silent: true,
					});
				}
			}
		}

		if (ChimesToggle.checked) {
			const randomInt = 1 + Math.floor(Math.random() * 5);
			const chimeFile = `/sounds/chime${randomInt}.flac`;
			const chimeAudio = new Audio(chimeFile);
			chimeAudio.volume = 0.9;
			chimeAudio.play();
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

	if (msg.peer) {
		if (msg.userId === myUserId && voice === "joining") {
			voice = "joined";
			VoiceToggle.classList.remove("voice_toggle_joining");
			VoiceToggle.classList.add("voice_toggle_leave");
			VoiceToggle.textContent = "Leave Voice";
			playJoinAudio();
		} else if (voice === "joined") {
			const { peer, userId } = msg;
			const conn = new RTCPeerConnection({ iceServers });
			peers[peer] = { userId, conn };
			setupPeerAudioConnection(peer);
			playJoinAudio();
			const offer = await conn.createOffer();
			await conn.setLocalDescription(offer);
			send({ action: "rtc_signal", peer, data: { offer } });
		}
		if (msg.ring) {
			VoiceDecline.hidden = false;
			VoiceToggle.classList.add("voice_toggle_accept");
			const ringtoneFile = "/sounds/ringtone.flac";
			RingtoneAudio = new Audio(ringtoneFile);
			RingtoneAudio.play();
			VoiceToggle.addEventListener("click", stopRingtone);
			VoiceDecline.addEventListener("click", stopRingtone);
		}
	}

	if (msg.rtc_signal) {
		const { peer, userId, data } = msg.rtc_signal;
		if (data.offer) {
			const conn = new RTCPeerConnection({ iceServers });
			peers[peer] = { userId, conn };
			setupPeerAudioConnection(peer);
			conn.setRemoteDescription(new RTCSessionDescription(data.offer));
			const answer = await conn.createAnswer();
			await conn.setLocalDescription(answer);
			send({ action: "rtc_signal", peer, data: { answer } });
		}
		if (data.answer) {
			const remoteDesc = new RTCSessionDescription(data.answer);
			await peers[peer].conn.setRemoteDescription(remoteDesc);
		}
		if (data.iceCandidate) {
			try {
				await peers[peer].conn.addIceCandidate(data.iceCandidate);
			} catch (e) {
				console.error("Error adding received ice candidate", e);
			}
		}
	}

	if (msg.peerDisconnect) {
		if (voice === "joined") {
			deletePeer(msg.peerDisconnect);
			playLeaveAudio();
		}
		if (Object.keys(peers).length === 0 && RingtoneAudio) {
			stopRingtone();
		}
	}
});

/*
 * rtc audio functions
 */
function setSpeaking(peer, speaking) {
	if (!peers[peer]) return false;
	const { lastSpeaking } = peers[peer];
	if (
		speaking ||
		!lastSpeaking ||
		moment().diff(lastSpeaking, "millisecond") > 200
	) {
		peers[peer].lastSpeaking = moment();
		const userId = peer === "me" ? myUserId : peers[peer].userId;
		const TargetUser = document.querySelector(`#user_${userId}`);
		if (!TargetUser) return false;
		if (speaking) {
			TargetUser.classList.add("speaking");
		} else {
			TargetUser.classList.remove("speaking");
		}
	}
	return true;
}

function processAudioStream(peer, stream) {
	if (!peers[peer]) peers[peer] = {};

	const RemoteAudioPre = new Audio();
	RemoteAudioPre.id = `audio_pre_${peer}`;
	RemoteAudioPre.autoplay = true;
	RemoteAudioPre.volume = false;
	RemoteAudioPre.srcObject = stream;
	peers[peer].RemoteAudioPre = RemoteAudioPre;

	const context = new AudioContext();
	peers[peer].context = context;
	const source = context.createMediaStreamSource(RemoteAudioPre.srcObject);
	const dest = context.createMediaStreamDestination();
	const analyser = context.createAnalyser();
	analyser.fftSize = 128;
	source.connect(analyser);
	const len = analyser.frequencyBinCount;
	const buf = new Uint8Array(len);
	function detectSpeaker() {
		analyser.getByteFrequencyData(buf);
		const avgVolume = buf.reduce((acc, cur) => acc + cur, 0) / len;
		if (setSpeaking(peer, avgVolume > 35)) {
			requestAnimationFrame(detectSpeaker);
		}
	}
	detectSpeaker();
	peers[peer].stream = stream;
	peers[peer].analyser = analyser;

	if (peer !== "me") {
		const gainNode = context.createGain();
		gainNode.gain.value = 1;
		if (settings) {
			const { userGain } = settings;
			const userId = peers[peer].userId;
			if (userGain && userGain[userId]) {
				gainNode.gain.value = userGain[userId];
			}
		}
		source.connect(gainNode).connect(context.destination);
		peers[peer].gainNode = gainNode;

		const VolumeSlider = document
			.querySelector(`#user_${peers[peer].userId}`)
			.querySelector(".volume_slider");
		VolumeSlider.hidden = false;
	}
}

function setupPeerAudioConnection(peer) {
	const { conn } = peers[peer];
	conn.addEventListener("icecandidate", (event) => {
		if (event.candidate) {
			send({
				action: "rtc_signal",
				peer,
				data: { iceCandidate: event.candidate },
			});
		}
	});
	conn.addEventListener("connectionstatechange", () => {
		if (conn.connectionState === "connected") {
			console.log(`Connected to peer: ${peer}`);
		}
	});
	conn.addEventListener("track", async (event) => {
		const [remoteStream] = event.streams;
		processAudioStream(peer, remoteStream);
	});
	audioStream.getTracks().forEach((track) => conn.addTrack(track, audioStream));
}

function deletePeer(peer) {
	if (peers[peer]) {
		const { stream, analyser, RemoteAudioPre, conn, gainNode, context } =
			peers[peer];
		if (stream) stream.getTracks().forEach((track) => track.stop());
		if (analyser) analyser.disconnect();
		if (gainNode) gainNode.disconnect();
		if (RemoteAudioPre) RemoteAudioPre.remove();
		if (context) context.close();
		if (conn) conn.close();
		delete peers[peer];
	}
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
	const { username, stats, status, id, banner } = user;
	const UserTemplate = document
		.querySelector("#user_template")
		.content.cloneNode(true);

	UserTemplate.querySelector(".user").id = `user_${id}`;
	UserTemplate.querySelector(".username").textContent = username;

	const Status = UserTemplate.querySelector(".status");
	if (status.trim()) {
		Status.textContent = status.trim();
	} else {
		Status.innerHTML = "&nbsp;";
	}

	setPresenceClasses(UserTemplate.querySelector(".presence"), stats);

	UserTemplate.querySelector(".user").style.background =
		!stats.offline && banner
			? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.45)), url('${banner}')`
			: "";

	const VolumeSlider = UserTemplate.querySelector(".volume_slider");
	VolumeSlider.value =
		settings && settings.userGain && settings.userGain[id]
			? settings.userGain[id]
			: 1;
	let inVoice = false;
	for (const peer in peers) {
		if (peers[peer].userId === id) {
			inVoice = true;
			break;
		}
	}
	VolumeSlider.hidden = voice !== "joined" || id === myUserId || !inVoice;
	VolumeSlider.addEventListener("change", () => {
		for (const peer in peers) {
			if (peers[peer].userId === id && peers[peer].gainNode) {
				peers[peer].gainNode.gain.value = VolumeSlider.value;
				const userGain = settings.userGain;
				userGain[id] = VolumeSlider.value;
				send({
					action: "edit_settings",
					data: {
						settings: {
							userGain: {
								...settings.userGain,
								...userGain,
							},
						},
					},
				});
			}
		}
	});

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
		data: { content: MessageEditorQuill.getText() },
	});

	MessageEditorQuill.setContents([]);
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
				chimes: ChimesToggle.checked,
				customCss: CustomCss.value,
				notifs: NotifsToggle.checked,
			},
		},
	});
});
NotifsToggle.addEventListener("change", async () => {
	if (NotifsToggle.checked) {
		const perm = await Notification.requestPermission();
		if (perm !== "granted") {
			NotifsToggle.checked = false;
		}
	}
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
		playLeaveAudio();
	}
});

function playJoinAudio() {
	const joinFile = "/sounds/join.flac";
	const joinAudio = new Audio(joinFile);
	joinAudio.volume = 0.9;
	joinAudio.play();
}

function playLeaveAudio() {
	const leaveFile = "/sounds/leave.flac";
	const leaveAudio = new Audio(leaveFile);
	leaveAudio.volume = 0.9;
	leaveAudio.play();
}

function stopRingtone() {
	VoiceToggle.classList.remove("voice_toggle_accept");
	VoiceDecline.hidden = true;
	RingtoneAudio.pause();
	RingtoneAudio.remove();
}
