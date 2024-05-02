import type { Moment } from "moment";

export type UserStat =
	| "talking"
	| "muted"
	| "deafened"
	| "typing"
	| "in_call"
	| "active"
	| "inactive"
	| "offline";

export interface User {
	id: string;
	username: string;
	stats: { [stat in UserStat]?: boolean };
	lastActive: Moment;
	status: string;
	banner: string;
	settings: UserSettings;
}

export interface UserSettings {
	banner: string;
	chimes: boolean;
	customCss: string;
	notifs: boolean;
}

export interface SocketData {
	token: string;
	stoken: string;
	user: User;
	peerId?: string;
}
