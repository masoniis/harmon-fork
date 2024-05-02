import type { unitOfTime } from "moment";
import { cwd } from "node:process";
import type { UserSettings } from "./types";

function ife<T>(e: string | undefined, f: (v: string) => T, v: T) {
	return e ? f(e) : v;
}

export default {
	minUsernameLength: ife(process.env.MIN_USERNAME_LENGTH, parseInt, 3),
	maxUsernameLength: ife(process.env.MAX_USERNAME_LENGTH, parseInt, 20),
	usernameValidationRegex: ife(
		process.env.USERNAME_VALIDATION_REGEX,
		(s) => new RegExp(s),
		/^(?!.*  )[A-Za-z0-9!?.,:;()$%*<]+[A-Za-z0-9!?.,:;()$%*< ]+[A-Za-z0-9!?.,:;()$%*<]+$/,
	),
	defaultUsernamePrefix: process.env.DEFAULT_USERNAME_PREFIX ?? "user",
	port: ife(process.env.PORT, parseInt, 3000),
	dataDir: process.env.DATA_DIR ?? `${cwd()}/data`,
	inactiveTimeout: ife(process.env.INACTIVE_TIMEOUT, parseInt, 10),
	inactiveTimeoutUnit: (process.env.INACTIVE_TIMEOUT_UNIT ??
		"minute") as unitOfTime.DurationConstructor,
	iceServers: ife(process.env.ICE_SERVERS, JSON.parse, [
		{
			urls: "stun:stun.l.google.com:19302",
		},
	]),
	defaultUserSettings: ife(
		process.env.DEFAULT_USER_SETTINGS,
		(s) => JSON.parse(s) as UserSettings,
		{
			banner: "",
			chimes: true,
			notifs: false,
		} as UserSettings,
	),
};
