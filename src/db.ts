import { mkdir, unlink, appendFile, readFile, exists } from "node:fs/promises";
import constants from "./constants";

const tables = [
	"token",
	"id",
	"username",
	"status",
	"banner",
	"settings",
] as const;
type Table = (typeof tables)[number];

const chatFilePath = `${constants.dataDir}/chat`;

await mkdir(constants.dataDir, { recursive: true });
for (const table of tables) {
	await mkdir(`${constants.dataDir}/${table}`, { recursive: true });
}

function loc(table: Table, key: string) {
	return `${constants.dataDir}/${table}/${key}`;
}

export default {
	async write(table: Table, key: string, value: string) {
		return await Bun.write(loc(table, key), value);
	},

	async read(table: Table, key: string) {
		try {
			return await Bun.file(loc(table, key)).text();
		} catch (e) {
			return undefined;
		}
	},

	async readOrWriteNew(table: Table, key: string, value: string) {
		const result = await this.read(table, key);
		if (!result) {
			await this.write(table, key, value);
			return value;
		}
		return result;
	},

	async delete(table: Table, key: string) {
		await unlink(loc(table, key));
	},

	chat: {
		async read() {
			return (await exists(chatFilePath))
				? (await readFile(chatFilePath)).toString()
				: "";
		},

		async append(text: string) {
			return await appendFile(chatFilePath, text);
		},
	},
};
