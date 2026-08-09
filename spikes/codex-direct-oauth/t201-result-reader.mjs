import { readFinalBrokerResult } from "./lib/t201-broker-result-channel.mjs";

try {
  const received = await readFinalBrokerResult();
  process.stdout.write(received.text);
  process.stderr.write(`safe_result_reader_success:${received.reader_uid}:${received.reader_gid}:${received.file_mode.toString(8)}:${received.same_filesystem ? "same_filesystem" : "different_filesystem"}\n`);
} catch (error) {
  const operation = error?.safe_result_artifact_operation ?? "reader_preflight";
  const errno = error?.safe_result_artifact_errno ?? "unknown";
  process.stderr.write(`safe_result_reader_failure:${operation}:${errno}\n`);
  process.exitCode = 1;
}
