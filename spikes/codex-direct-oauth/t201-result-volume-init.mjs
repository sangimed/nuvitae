import fs from "node:fs/promises";

const resultDirectory = "/spike/result";
await fs.mkdir(resultDirectory, { recursive: true, mode: 0o700 });
await fs.chown(resultDirectory, 1000, 1000);
await fs.chmod(resultDirectory, 0o700);
const stat = await fs.stat(resultDirectory);
if (!stat.isDirectory() || stat.uid !== 1000 || stat.gid !== 1000 || (stat.mode & 0o777) !== 0o700) {
  throw new Error("result_volume_initialization_failed");
}
process.stdout.write('{"result_volume_initialization":"passed"}\n');
