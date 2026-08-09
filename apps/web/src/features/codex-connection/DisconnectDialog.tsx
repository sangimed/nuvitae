"use client";

export function DisconnectDialog(props: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !props.busy) {
          props.onCancel();
        }
      }}
    >
      <div
        className="guidance-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disconnect-codex-title"
      >
        <h3 id="disconnect-codex-title">Disconnect Codex?</h3>
        <p>
          Nuvitae will remove this connection from this device. Your uploaded
          resume, review, and saved resume data will stay here.
        </p>
        <div className="action-row">
          <button type="button" onClick={props.onCancel} disabled={props.busy}>
            Keep Codex connected
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={props.onConfirm}
            disabled={props.busy}
            aria-busy={props.busy}
          >
            {props.busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}
