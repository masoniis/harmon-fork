import { cwd } from "node:process";
import { mkdir, unlink } from "node:fs/promises";

type Table = "token" | "username";

// Ensure data directories exist

const dataDir = process.env.DATA_DIR ?? `${cwd()}/data`;
const dirs = {
  token: process.env.TOKEN_DIR ?? `${dataDir}/token`,
  username: process.env.USERNAME_DIR ?? `${dataDir}/username`,
};

await mkdir(dataDir, { recursive: true });
await mkdir(dirs.token, { recursive: true });
await mkdir(dirs.username, { recursive: true });

function loc(table: Table, key: string) {
  return `${dirs[table]}/${key}`;
}

export default {
  async write(table: Table, key: string, value: string) {
    return await Bun.write(loc(table, key), value);
  },

  async read(table: Table, key: string) {
    try {
      return await Bun.file(loc(table, key)).text();
    } catch (e) {
      return false;
    }
  },

  async delete(table: Table, key: string) {
    await unlink(loc(table, key));
  },
};
