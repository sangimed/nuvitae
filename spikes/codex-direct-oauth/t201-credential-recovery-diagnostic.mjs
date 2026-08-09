import { diagnoseCredentialRecovery } from "./lib/t201-credential-recovery-diagnostic.mjs";

const value = await diagnoseCredentialRecovery({
  keyMountPath: "/run/t199-key",
  keyPath: "/run/t199-key/master.key",
  credentialMountPath: "/spike/credentials",
  credentialPath: "/spike/credentials/credential.json",
  bindings: {
    ownerNamespace: "live-t199-owner",
    connectionId: "live-t199-connection",
    provider: "openai-codex",
  },
});
process.stdout.write(`${JSON.stringify(value)}\n`);
process.exitCode = value.failure_stage === "complete" ? 0 : 1;
