# Nuvitae Community user guide

Nuvitae Community runs on your own computer and is designed for one owner. You
can import an existing resume or start one manually, edit it with a live
preview, and return to saved work later.

## Install and open Nuvitae

You need Git and Docker Engine or Docker Desktop with Docker Compose. You do not
need to install Node.js, pnpm, Python, PostgreSQL, or Valkey.

In a terminal, clone Nuvitae, enter its folder, and create your private local
configuration:

```sh
git clone https://github.com/sangimed/nuvitae.git
cd nuvitae
sh scripts/community-bootstrap.sh
```

Start Nuvitae:

```sh
docker compose --env-file .community.env up -d --build
docker compose --env-file .community.env up --wait
```

Open <http://localhost:3000> on the same computer. Community V1 does not support
access over a home or office network or over the public internet.

When the sign-in form appears, retrieve the owner access secret:

```sh
sh scripts/community-owner-secret.sh
```

Paste it directly into Nuvitae. Keep `.community.env` and the owner access
secret private. Do not put the secret in another command, a support request, an
issue, or chat.

For more installation detail, including normal stop and restart commands, see
the [Community installation guide](community-installation.md).

## Choose how to start

After signing in, choose one of these paths:

- **Import a resume** to upload an existing PDF or DOCX, review the information
  Nuvitae finds, and create an editable resume.
- **Create a resume** to start a blank manual draft without connecting Codex.

Use **My resumes** to reopen saved manual drafts and imported resumes. Select
**Continue editing** beside the item you want.

## Connect Codex

Codex provides the most complete import and the optional AI editing available
later. It is not required for manual entry. Without Codex, an import can use
limited automatic extraction, but it may miss information.

On the import screen:

1. Wait while Nuvitae shows **Checking your Codex connection**. A connect action
   appears only after this check shows that one is needed.
2. Select **Connect Codex**.
3. Nuvitae opens the secure OpenAI device page and shows a one-time code. If a
   pop-up was blocked, select **Open secure OpenAI page**.
4. Enter the code on the OpenAI page. Keep Nuvitae open while it checks for
   completion.
5. Continue when Nuvitae says **Codex is ready.**

No callback address or port needs to be changed. Treat the one-time code as
private, short-lived authentication data; never paste it into support messages,
issues, logs, or chat.

If connection does not finish, select **Cancel connection** and try again. If
Nuvitae says the connection expired or needs attention, select **Reconnect
Codex**. A temporary unavailable, rate-limit, or quota message does not remove
your resume data; wait and retry later, or select **Enter my details manually
instead**. You can also **Disconnect** Codex without deleting your resumes.

## Import a PDF or DOCX

Choose **Import a resume**, then **Import my resume**. The upload must be:

- a PDF or DOCX file;
- 10 MB or smaller;
- no more than 5 rendered pages;
- in French, English, or both; and
- text-based, with selectable text.

Scanned and image-only documents are not supported. Choose or drop the file,
then select **Upload and start import**.

Nuvitae shows the real processing step while it checks the document, reads its
content, organizes resume sections, and prepares review. You can safely reload
or reopen the import URL; processing and a completed review draft are recovered
without starting another import.

When the draft is ready, Nuvitae opens its review. If processing cannot finish,
follow the actions shown on screen. Depending on the failure, you can **Upload a
different file** or **Enter manually**. Uploading a replacement does not delete
the earlier upload immediately; it remains subject to its original retention
deadline.

## Review imported information

The review is a structured draft; it does not change the uploaded file.

1. Start with sections marked **to review**.
2. For each uncertain suggestion, check the value and select **Confirm this
   information**, **Edit field**, or **Leave out**.
3. Resolve each review note with the action that matches what you want. Nuvitae
   leaves information out when it cannot use it safely; add it yourself only if
   you want it included.
4. Use **Accept all suggested details** only after you have checked all of those
   suggestions.
5. When the review says it is complete, select **Create my resume**.

Nuvitae does not create the editable resume until all required review items are
resolved and you select **Create my resume**. If another tab changed the review,
Nuvitae reloads the latest information instead of overwriting it.

**Discard import** discards an unconfirmed draft and schedules its uploaded
source for cleanup. Cleanup is not immediate, and this action does not delete a
resume that was already created.

## Create a resume manually

Choose **Create a resume** or **Start from scratch**. Nuvitae creates a blank
draft and opens the visual editor.

Choose a section, enter your information, and use **Add** or **Remove** controls
as needed. Use the up and down controls in the section list to change the order.
On a narrow screen, switch between the **Edit** and **Preview** tabs.

Select **Save draft** before leaving. **Undo to saved** restores the last saved
version. Manual drafts can currently be edited, previewed, saved, and reopened;
PDF export and contextual AI editing are not currently available for them.

## Edit and preview an imported resume

After review, the editable resume opens with its sections and a **Live preview**
that updates as you type. On a narrow screen, switch between **Edit** and
**Preview**. You can add and remove entries, move sections up or down, and edit
the supported resume fields.

Changes are not saved automatically. Watch the status beside the save controls:

- **Unsaved changes**: select **Save resume** before leaving.
- **Saved**: the current version can be reopened from **My resumes**.
- **Error — retry**: select **Retry save**.
- **Error — reload required**: another tab changed the resume; select **Reload
  resume** to load that saved version rather than overwrite it.

**Undo to saved** discards the current page's unsaved changes.

## Optional AI editing

Contextual AI editing is available on a saved imported resume for the summary,
project descriptions, and individual responsibility or achievement entries.
Codex must be connected.

1. Save or undo any current changes.
2. Choose **Improve writing**, **Make concise**, **Strengthen impact**, or **Fix
   grammar** beside the text you want to change.
3. Select **Edit with AI**.
4. Compare **Before** and **After**. Select **Accept proposal**, **Reject
   proposal**, or **Regenerate**.
5. If you accept, select **Save resume** separately to keep the change.

Nothing changes just because a proposal was generated. Nuvitae also blocks a
proposal when it cannot verify that the wording preserves the facts in the
selected text.

## Export an imported resume as PDF

Save your changes, then select **Export PDF**. On the export page, select **Save
as PDF** and choose **Save as PDF** in your browser's print dialog. The exported
resume follows the preview's reading order and keeps its text selectable.

If preparation fails or takes too long, your resume is unchanged. Select **Try
again**, or return to the resume and retry later.

## Privacy and source deletion

- Community data stays in Docker volumes on the computer running Nuvitae and is
  available only to the signed-in installation owner through the product.
- During import, Codex receives the text extracted from the uploaded resume,
  not the original PDF or DOCX and not access to anything else in Nuvitae.
- During contextual AI editing, Codex receives only the saved text field you
  selected for editing.
- Suggested imported fields remain unconfirmed until you review them. AI edit
  proposals do not alter the resume unless you accept and then save them.
- The uploaded file and temporary working copies are removed within seven days
  of upload. The editable resume is stored separately.
- On a confirmed imported resume, **Delete uploaded source file** permanently
  deletes the upload and source-only artifacts while preserving the editable
  resume and its changes. Confirm with **Delete source only**. A failed deletion
  leaves the source in its previous state so you can retry.
- Normal stop and restart commands preserve resumes, imports, connection state,
  and configuration. Do not use `docker compose down -v` unless you deliberately
  intend to erase the installation's Docker data.

Sign out when other people can use the browser or computer.

## Safe troubleshooting

Start with the recovery action shown in Nuvitae. Reloading is safe for saved
work and active imports, but not for unsaved editor changes.

- **Nuvitae does not open:** confirm Docker is running, then run
  `docker compose --env-file .community.env ps`. Follow the service-specific
  checks in the [installation guide](community-installation.md#troubleshooting).
- **Sign-in fails:** retrieve the owner access secret again with
  `sh scripts/community-owner-secret.sh` and confirm you opened
  <http://localhost:3000> on the same computer.
- **Codex does not connect:** allow the secure OpenAI page to open, use the
  displayed one-time code there, or cancel and reconnect. No callback URL or
  port change is needed.
- **An upload is rejected:** check its type, size, page count, language, and
  whether its text can be selected. Use the offered replacement or manual-entry
  action.
- **Processing appears interrupted:** reopen the current import URL or reload
  it. Nuvitae resumes status checks without uploading the file again.
- **A save reports a conflict:** use the offered reload action, then repeat your
  change against the latest saved version.
- **PDF export fails:** select **Try again**. If the print dialog opens, choose
  its **Save as PDF** destination rather than a physical printer.

When asking for help, share only the on-screen safe error message and which step
failed. Never share resume text or files, `.community.env`, owner or provider
credentials, tokens, one-time codes, prompts, AI responses, private URLs, or
unredacted logs.
