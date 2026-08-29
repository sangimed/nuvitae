# Resume Import

The resume-import context turns a temporary uploaded resume into a user-reviewed structured resume. It keeps the original document separate from the information the user chooses to carry forward.

## Language

**Imported file**:
The original temporary PDF or DOCX supplied by the user for extraction. It is never altered by review changes.
_Avoid_: Edited CV, source of truth

**Review draft**:
The structured, reviewable interpretation of an imported file, including the user’s choices and outstanding review items. It can become a structured resume only after confirmation.
_Avoid_: Uploaded file, final resume

**Structured resume**:
The editable resume created from a confirmed review draft. It is independent of the temporary imported file.
_Avoid_: Original CV, import
