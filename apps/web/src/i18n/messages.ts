export type AppLocale = "en" | "fr" | "es" | "ar" | "zh-CN";

export const en = {
  "import.processing.eyebrow": "Import status",
  "import.processing.problem": "There is a problem",
  "import.processing.loading.experience":
    "Giving your experience section a quick once-over…",
  "import.processing.loading.bullets": "Making sure your bullet points behave…",
  "import.processing.loading.surprises":
    "Checking whether your document has any surprises…",
  "import.processing.loading.dates":
    "Looking for dates that travelled through time…",
  "import.processing.loading.sections":
    "Untangling the document, one section at a time…",
  "import.processing.loading.polishing":
    "Polishing things without inventing a promotion…",
  "import.processing.longWait":
    "This is taking a little longer. We’ll keep showing the latest processing step.",
  "import.processing.draftFields": "Draft fields",
  "import.processing.needsAttention": "Needs attention",
  "import.processing.review": "Review imported resume",
  "import.processing.openReview": "Open review page",
  "import.processing.replacementNotice":
    "If you upload a replacement, the previous import is not deleted here and remains subject to its original retention deadline.",
  "import.processing.replaceUpload": "Upload a different file",
  "import.processing.heading.processing": "Preparing your resume for review",
  "import.processing.heading.draft_ready": "Your resume draft is ready",
  "import.processing.heading.partial_extraction":
    "Your resume draft is ready with notes",
  "import.processing.heading.recoverable_timeout":
    "This is taking longer than expected",
  "import.processing.heading.validation_failure":
    "This file cannot be imported",
  "import.processing.heading.terminal_processing_failure":
    "This resume could not be prepared",
  "import.processing.heading.authentication_required": "Sign in required",
  "import.processing.heading.connectivity_lost": "Connection temporarily lost",
  "import.processing.heading.not_found": "Import unavailable",
  "import.processing.heading.expired": "Import expired",
  "import.processing.heading.cancelled": "Import stopped",
  "import.sourceDeletion.heading": "Uploaded source file",
  "import.sourceDeletion.summary":
    "Your uploaded file is temporary and separate from your structured resume. Deleting it keeps this resume and all edits.",
  "import.sourceDeletion.action": "Delete uploaded source file",
  "import.sourceDeletion.dialogTitle": "Delete uploaded source file?",
  "import.sourceDeletion.dialogDescription":
    "This permanently deletes the uploaded file and source-only artifacts. It does not delete your structured resume or your edits.",
  "import.sourceDeletion.confirm": "Delete source only",
  "import.sourceDeletion.pending": "Deleting source",
  "import.sourceDeletion.destructiveMarker": "Destructive action",
  "import.sourceDeletion.cancel": "Keep source",
  "import.sourceDeletion.error":
    "The uploaded source could not be deleted. Try again later.",
  "shell.home": "Home",
  "shell.resumes": "My resumes",
  "shell.import": "Import resume",
  "shell.create": "Create resume",
  "shell.skip": "Skip to content",
  "shell.brand": "Nuvitae home",
  "shell.navigation": "Primary navigation",
  "shell.language": "Application language",
  "shell.changed": "Application language changed. Your resume is unchanged.",
  "home.eyebrow": "Your next opportunity starts here",
  "home.title": "Build a resume you feel good sending.",
  "home.lede":
    "Bring an existing resume or start fresh. You stay in control of every detail before you export.",
  "home.signIn": "Sign in from the header to save and return to your resumes.",
  "home.choices": "Choose how to start",
  "home.recommended": "Recommended",
  "home.importTitle": "Import your existing resume",
  "home.importDescription":
    "Upload a resume and use it as your starting point. Review what was found, make changes, then choose how it looks.",
  "home.importAction": "Import a resume",
  "home.fresh": "Start fresh",
  "home.createTitle": "Create a resume from scratch",
  "home.createDescription":
    "Add your experience one section at a time with a guided editor and a live preview.",
  "home.createAction": "Create a resume",
  "home.path": "A clear path from first draft to finished resume",
  "home.details": "Add your details",
  "home.review": "Review and refine",
  "home.export": "Preview and export",
  "home.privacy":
    "Your resume is kept private to your workspace. You decide when it is ready to download.",
  "import.entry.eyebrow": "Recommended",
  "import.entry.title": "Start from your existing resume",
  "import.entry.description":
    "Upload a PDF or DOCX resume and Nuvitae will prepare a draft for you to review before any structured resume is created.",
  "import.entry.choices": "Resume creation choices",
  "import.entry.recommendedPath": "Recommended path",
  "import.entry.importTitle": "Import a resume",
  "import.entry.importDescription":
    "Best if you already have a resume. You stay in control and review the imported information before using it.",
  "import.entry.importAction": "Import my resume",
  "import.entry.manualTitle": "Enter it manually",
  "import.entry.manualDescription":
    "Use this if you prefer to start with a blank resume and fill in each section yourself.",
  "import.entry.manualAction": "Enter manually",
  "import.upload.eyebrow": "Resume import",
  "import.upload.title": "Choose the resume file to import",
  "import.upload.description":
    "Your file is used only to prepare a draft. You will review every detail before it is saved as a resume.",
  "import.upload.guidanceTitle": "Before you upload",
  "import.upload.files": "PDF and DOCX files only.",
  "import.upload.languages":
    "French, English, or bilingual French-English resumes.",
  "import.upload.size": "10 MB maximum file size.",
  "import.upload.pages": "Up to 5 pages.",
  "import.upload.selectableText":
    "The text must be selectable, not a scan or photo.",
  "import.upload.retention":
    "Your uploaded file and temporary working copies are removed within seven days.",
  "import.upload.errorTitle": "The file could not be uploaded",
  "import.upload.fileLabel": "Resume file",
  "import.upload.dropTitle": "Drop your resume here",
  "import.upload.dropHint": "or choose a PDF or DOCX file from your device",
  "import.upload.noFile": "No file selected.",
  "import.upload.selectedFile": "Selected file:",
  "import.upload.back": "Back",
  "import.upload.submit": "Upload and start import",
  "import.upload.uploading": "Uploading…",
  "import.upload.error.unsupportedExtension":
    "Choose a PDF or DOCX resume file.",
  "import.upload.error.emptyFile": "Choose a resume file that is not empty.",
  "import.upload.error.tooLarge":
    "Choose a resume file that is 10 MB or smaller.",
  "import.upload.error.required":
    "Choose a resume file before starting the import.",
  "import.provider.title": "How Codex helps with your import",
  "import.provider.connection":
    "Codex needs to be connected for the most complete import.",
  "import.provider.access":
    "Codex receives only the text from your resume, not access to anything else in Nuvitae.",
  "import.provider.review":
    "Nothing is saved to your resume until you review it.",
  "import.provider.verification":
    "Nuvitae checks suggestions against your document and leaves out anything that cannot be verified.",
  "import.provider.fallback":
    "If Codex is unavailable, you can use a limited import that may miss information, or enter your details manually.",
  "import.status.uploadAccepted": "Your file was accepted for import.",
  "import.status.validationStarted":
    "Nuvitae is checking that your document can be imported.",
  "import.status.processingStarted":
    "Nuvitae is preparing your resume for review.",
  "import.status.processingProgress":
    "Nuvitae is still preparing your resume for review.",
  "import.processingStep.checkingDocument": "checking the document",
  "import.processingStep.readingContent": "reading the content",
  "import.processingStep.organizingResumeSections":
    "organizing resume sections",
  "import.processingStep.preparingReview": "preparing review",
  "import.processingStep.current": "Current step:",
  "import.status.providerConnectionRequired":
    "A connected AI provider is needed to analyse your resume.",
  "import.status.providerUnavailable":
    "The AI provider is temporarily unavailable. You can try again or continue with limited extraction.",
  "import.status.limitedExtractionStarted":
    "Limited automatic extraction has started. It may miss information.",
  "import.status.partialDraftReady":
    "A partial draft is ready for review. Some information may be missing.",
  "import.status.reviewReady": "Your resume draft is ready for review.",
  "import.status.processingFailed":
    "Your resume could not be prepared for review. You can try again or enter the information manually.",
  "import.status.retryStarted":
    "Nuvitae is trying to prepare your resume again.",
  "import.status.cancellationCompleted": "The import was cancelled.",
  "import.status.sourceDeletionCompleted":
    "The uploaded source has been removed.",
  "import.status.unknown": "The import status changed.",
  "metadata.description":
    "Create and improve your resume with Nuvitae Community",
  "review.warning.unsafe.title": "Information not included",
  "review.warning.missing.title": "Information to add or leave out",
  "review.warning.ambiguous.title": "Please choose how to use this information",
  "review.warning.default.title": "A quick review is needed",
  "review.warning.unsafe.message":
    "Nuvitae could not safely use some information from your resume. It was left out; you can add it yourself if you want it included.",
  "review.warning.missing.message":
    "This information was not added automatically. You can add it, or leave it out for now.",
  "review.warning.message.ambiguous":
    "This information may have more than one meaning. Review it and choose what belongs in your resume.",
  "review.warning.message.conflicting":
    "Some information does not match. Review the details before deciding what to keep.",
  "review.warning.message.duplicate":
    "This information may already appear elsewhere in your resume.",
  "review.warning.message.lowConfidence":
    "This information could not be identified with confidence. Please check it before using it.",
  "review.warning.message.inferred":
    "This suggestion was inferred from your resume. Confirm it before it is used.",
  "review.warning.message.mixedContent":
    "This section contains different kinds of information that need your review.",
  "review.warning.message.expiredSource":
    "The temporary source file is no longer available. You can still review the information shown here.",
  "review.warning.message.default":
    "This information needs your review before you continue.",
  "review.warning.context":
    "This relates to imported information in this section.",
  "review.warning.state": "This item is",
  "review.warning.status.needsReview": "waiting for your review",
  "review.warning.status.confirmed": "confirmed",
  "review.warning.status.edited": "edited",
  "review.warning.status.excluded": "excluded",
  "review.warning.status.intentionallyLeft": "left out for now",
  "review.warning.leaveOut": "Leave out for now",
  "review.warning.confirm": "Confirm",
  "review.warning.edit": "Edit information",
  "review.warning.exclude": "Exclude",
  "review.provenance.inferred":
    "Found in your resume — your confirmation is needed",
  "review.provenance.pdf": "Imported from page",
  "review.provenance.docxBody": "Imported from the document body",
  "review.provenance.docxPart": "Imported from the document",
  "review.provenance.added": "Added by you",
  "review.provenance.edited": "Edited by you",
  "review.provenance.editedPdf": "Edited by you; originally imported from page",
  "review.provenance.initial": "Imported from initial resume",
  "review.provenance.found": "Found in your resume",
  "review.confirm.title.ready": "Your review is complete",
  "review.confirm.title.remaining": "Finish your review",
  "review.confirm.status.creating": "Creating your resume.",
  "review.confirm.status.ready": "Your resume is ready.",
  "review.confirm.status.discarding": "Scheduling source cleanup.",
  "review.confirm.error.heading": "The action could not be completed",
  "review.confirm.ready.description":
    "All review details are complete. Continue to create your editable resume from the information you have kept and edited.",
  "review.confirm.create": "Create my resume",
  "review.confirm.creating": "Creating your resume…",
  "review.confirm.remaining.heading": "Review remaining details",
  "review.confirm.remaining.one": "1 detail still needs your attention.",
  "review.confirm.remaining.many": "details still need your attention.",
  "review.confirm.remaining.instruction":
    "Review these items before creating your resume.",
  "review.confirm.discard": "Discard import",
  "review.confirm.dialog.description":
    "Nuvitae will discard this unconfirmed draft and schedule source cleanup. Deletion is not complete immediately, and an already confirmed resume would not be deleted by this action.",
  "review.confirm.working": "Working",
  "review.confirm.cancel": "Cancel",
  "review.confirm.discarded":
    "The import was discarded. Source cleanup has been scheduled.",
  "review.confirm.error.authentication":
    "Your session could not be verified. Sign in again and retry.",
  "review.confirm.error.notFound": "This import is no longer available.",
  "review.confirm.error.notReady":
    "This import is not ready to create a resume yet.",
  "review.confirm.error.unresolved":
    "Review the remaining information before creating your resume.",
  "review.confirm.error.noConfirmedField":
    "Confirm at least one detail before creating your resume.",
  "review.confirm.error.content":
    "Some reviewed information could not be used to create the resume. Please review it and try again.",
  "review.confirm.error.staleUpdate":
    "Your resume changed while the update was being saved. Reload it and try again.",
  "review.confirm.error.expired": "This import has expired.",
  "review.confirm.error.concurrent":
    "This resume is already being created. Wait a moment and check again.",
  "review.confirm.error.unavailable":
    "This action is temporarily unavailable. Please try again later.",
  "review.confirm.error.cancelled": "The request was stopped.",
  "review.confirm.error.generic":
    "We could not complete this action. Please try again later.",
  "review.confirm.destructive": "Destructive action",
  "review.minimum.loading": "Loading import review",
  "review.minimum.eyebrow": "Resume review",
  "review.minimum.loadingStatus": "Loading your resume information.",
  "review.minimum.unavailable": "Review unavailable",
  "review.minimum.title": "Check the information Nuvitae needs you to confirm",
  "review.minimum.sourceNote":
    "You are reviewing a structured draft. Your uploaded file stays unchanged.",
  "review.error.stale":
    "Your review has changed. We reloaded the latest information.",
  "review.minimum.loaded": "Review loaded.",
  "review.update.saving": "Saving your review…",
  "review.update.saved": "Changes saved.",
  "review.update.linkedWarningFailed":
    "Your confirmation was saved, but one related review item still needs attention.",
  "review.update.error.heading": "The review change could not be saved",
  "review.update.error.authentication":
    "Sign in to continue reviewing this import.",
  "review.update.error.notFound":
    "This import is unavailable or no longer accessible.",
  "review.update.error.notReady": "This import is not ready for review yet.",
  "review.update.error.expired": "This import has expired.",
  "review.update.error.rateLimited":
    "Too many review actions were sent. Wait and try again.",
  "review.update.error.unavailable":
    "Review is temporarily unavailable. Try again later.",
  "review.update.error.malformed":
    "The review response could not be read safely. Try again later.",
  "review.update.error.cancelled": "The review request was stopped.",
  "review.update.error.generic":
    "The review request could not be completed. Try again later.",
  "review.finalized.openResume": "Open my resume",
  "review.finalized.newImport": "Start a new import",
  "review.finalized.manual": "Continue manually",
} as const;

export type ExportMessageKey =
  | "resume.export.loading.title"
  | "resume.export.loading.status"
  | "resume.export.error.title"
  | "resume.export.error.safe"
  | "resume.export.retry"
  | "resume.export.back"
  | "resume.export.eyebrow"
  | "resume.export.title"
  | "resume.export.instructions"
  | "resume.export.opening"
  | "resume.export.save"
  | "resume.export.status.ready"
  | "resume.export.status.opening"
  | "resume.export.status.complete";
export type ExportMessages = Record<ExportMessageKey, string>;

export const exportMessages: Record<AppLocale, ExportMessages> = {
  en: {
    "resume.export.loading.title": "Preparing your PDF",
    "resume.export.loading.status": "Loading your resume for PDF export.",
    "resume.export.error.title": "PDF export unavailable",
    "resume.export.error.safe":
      "PDF export is temporarily unavailable. Please try again.",
    "resume.export.retry": "Try again",
    "resume.export.back": "Back to resume",
    "resume.export.eyebrow": "PDF export",
    "resume.export.title": "Your PDF is ready to save",
    "resume.export.instructions":
      "Choose Save as PDF in the print dialog. Text remains selectable and follows the preview’s reading order.",
    "resume.export.opening": "Opening…",
    "resume.export.save": "Save as PDF",
    "resume.export.status.ready": "PDF export is ready.",
    "resume.export.status.opening": "Opening the print dialog.",
    "resume.export.status.complete":
      "The print dialog closed. Your resume remains unchanged.",
  },
  fr: {
    "resume.export.loading.title": "Préparation de votre PDF",
    "resume.export.loading.status": "Chargement de votre CV pour l’export PDF.",
    "resume.export.error.title": "Export PDF indisponible",
    "resume.export.error.safe":
      "L’export PDF est temporairement indisponible. Réessayez.",
    "resume.export.retry": "Réessayer",
    "resume.export.back": "Retour au CV",
    "resume.export.eyebrow": "Export PDF",
    "resume.export.title": "Votre PDF est prêt à être enregistré",
    "resume.export.instructions":
      "Choisissez Enregistrer au format PDF dans la boîte de dialogue d’impression. Le texte reste sélectionnable et suit l’ordre de lecture de l’aperçu.",
    "resume.export.opening": "Ouverture…",
    "resume.export.save": "Enregistrer au format PDF",
    "resume.export.status.ready": "L’export PDF est prêt.",
    "resume.export.status.opening":
      "Ouverture de la boîte de dialogue d’impression.",
    "resume.export.status.complete":
      "La boîte de dialogue d’impression est fermée. Votre CV reste inchangé.",
  },
  es: {
    "resume.export.loading.title": "Preparando tu PDF",
    "resume.export.loading.status":
      "Cargando tu currículum para exportarlo a PDF.",
    "resume.export.error.title": "La exportación a PDF no está disponible",
    "resume.export.error.safe":
      "La exportación a PDF no está disponible temporalmente. Inténtalo de nuevo.",
    "resume.export.retry": "Intentar de nuevo",
    "resume.export.back": "Volver al currículum",
    "resume.export.eyebrow": "Exportación a PDF",
    "resume.export.title": "Tu PDF está listo para guardarse",
    "resume.export.instructions":
      "Elige Guardar como PDF en el cuadro de impresión. El texto sigue siendo seleccionable y conserva el orden de lectura de la vista previa.",
    "resume.export.opening": "Abriendo…",
    "resume.export.save": "Guardar como PDF",
    "resume.export.status.ready": "La exportación a PDF está lista.",
    "resume.export.status.opening": "Abriendo el cuadro de impresión.",
    "resume.export.status.complete":
      "El cuadro de impresión se cerró. Tu currículum no cambió.",
  },
  ar: {
    "resume.export.loading.title": "جارٍ تجهيز ملف PDF",
    "resume.export.loading.status":
      "جارٍ تحميل سيرتك الذاتية لتصديرها كملف PDF.",
    "resume.export.error.title": "تصدير PDF غير متاح",
    "resume.export.error.safe": "تصدير PDF غير متاح مؤقتًا. حاول مرة أخرى.",
    "resume.export.retry": "حاول مرة أخرى",
    "resume.export.back": "العودة إلى السيرة الذاتية",
    "resume.export.eyebrow": "تصدير PDF",
    "resume.export.title": "ملف PDF جاهز للحفظ",
    "resume.export.instructions":
      "اختر حفظ كملف PDF في مربع حوار الطباعة. يبقى النص قابلاً للتحديد ويتبع ترتيب القراءة في المعاينة.",
    "resume.export.opening": "جارٍ الفتح…",
    "resume.export.save": "حفظ كملف PDF",
    "resume.export.status.ready": "تصدير PDF جاهز.",
    "resume.export.status.opening": "جارٍ فتح مربع حوار الطباعة.",
    "resume.export.status.complete":
      "أُغلق مربع حوار الطباعة. لم تتغير سيرتك الذاتية.",
  },
  "zh-CN": {
    "resume.export.loading.title": "正在准备 PDF",
    "resume.export.loading.status": "正在加载您的简历以导出 PDF。",
    "resume.export.error.title": "PDF 导出不可用",
    "resume.export.error.safe": "PDF 导出暂时不可用，请稍后重试。",
    "resume.export.retry": "重试",
    "resume.export.back": "返回简历",
    "resume.export.eyebrow": "PDF 导出",
    "resume.export.title": "您的 PDF 已可保存",
    "resume.export.instructions":
      "请在打印对话框中选择“另存为 PDF”。文本仍可选择，并遵循预览中的阅读顺序。",
    "resume.export.opening": "正在打开…",
    "resume.export.save": "另存为 PDF",
    "resume.export.status.ready": "PDF 导出已准备就绪。",
    "resume.export.status.opening": "正在打开打印对话框。",
    "resume.export.status.complete": "打印对话框已关闭。您的简历未发生变化。",
  },
} as const;

export type BaseMessageKey = keyof typeof en;
export type MessageKey = BaseMessageKey | ExportMessageKey;
export type Messages = Record<BaseMessageKey, string>;

const fr: Messages = {
  "import.processing.eyebrow": "État de l’importation",
  "import.processing.problem": "Un problème est survenu",
  "import.processing.loading.experience":
    "Un dernier regard sur votre expérience…",
  "import.processing.loading.bullets":
    "Nous vérifions que vos listes à puces se tiennent bien…",
  "import.processing.loading.surprises":
    "Nous cherchons les surprises dans votre document…",
  "import.processing.loading.dates":
    "Nous repérons les dates qui ont voyagé dans le temps…",
  "import.processing.loading.sections":
    "Nous démêlons le document, rubrique par rubrique…",
  "import.processing.loading.polishing":
    "Nous peaufinons le tout sans inventer de promotion…",
  "import.processing.longWait":
    "Cela prend un peu plus de temps. Nous continuons à afficher la dernière étape du traitement.",
  "import.processing.draftFields": "Champs du brouillon",
  "import.processing.needsAttention": "À vérifier",
  "import.processing.review": "Vérifier le CV importé",
  "import.processing.openReview": "Ouvrir la page de vérification",
  "import.processing.replacementNotice":
    "Si vous importez un autre fichier, l’importation précédente n’est pas supprimée ici et conserve son échéance de conservation initiale.",
  "import.processing.replaceUpload": "Importer un autre fichier",
  "import.processing.heading.processing":
    "Préparation de votre CV pour la vérification",
  "import.processing.heading.draft_ready": "Votre brouillon de CV est prêt",
  "import.processing.heading.partial_extraction":
    "Votre brouillon de CV est prêt avec des remarques",
  "import.processing.heading.recoverable_timeout":
    "Cela prend plus de temps que prévu",
  "import.processing.heading.validation_failure":
    "Ce fichier ne peut pas être importé",
  "import.processing.heading.terminal_processing_failure":
    "Ce CV n’a pas pu être préparé",
  "import.processing.heading.authentication_required": "Connexion requise",
  "import.processing.heading.connectivity_lost":
    "Connexion temporairement perdue",
  "import.processing.heading.not_found": "Importation indisponible",
  "import.processing.heading.expired": "Importation expirée",
  "import.processing.heading.cancelled": "Importation arrêtée",
  "import.sourceDeletion.heading": "Fichier source téléversé",
  "import.sourceDeletion.summary":
    "Votre fichier téléversé est temporaire et distinct de votre CV structuré. Sa suppression conserve ce CV et toutes vos modifications.",
  "import.sourceDeletion.action": "Supprimer le fichier source téléversé",
  "import.sourceDeletion.dialogTitle":
    "Supprimer le fichier source téléversé ?",
  "import.sourceDeletion.dialogDescription":
    "Cette action supprime définitivement le fichier téléversé et les éléments associés à la source. Elle ne supprime ni votre CV structuré ni vos modifications.",
  "import.sourceDeletion.confirm": "Supprimer uniquement la source",
  "import.sourceDeletion.pending": "Suppression de la source",
  "import.sourceDeletion.destructiveMarker": "Action destructive",
  "import.sourceDeletion.cancel": "Conserver la source",
  "import.sourceDeletion.error":
    "Le fichier source téléversé n’a pas pu être supprimé. Réessayez plus tard.",
  "shell.home": "Accueil",
  "shell.resumes": "Mes CV",
  "shell.import": "Importer un CV",
  "shell.create": "Créer un CV",
  "shell.skip": "Aller au contenu",
  "shell.brand": "Accueil Nuvitae",
  "shell.navigation": "Navigation principale",
  "shell.language": "Langue de l’application",
  "shell.changed":
    "La langue de l’application a changé. Votre CV reste inchangé.",
  "home.eyebrow": "Votre prochaine opportunité commence ici",
  "home.title": "Créez un CV que vous serez fier d’envoyer.",
  "home.lede":
    "Importez un CV ou partez de zéro. Vous gardez le contrôle de chaque détail avant l’exportation.",
  "home.signIn":
    "Connectez-vous en haut de la page pour enregistrer et retrouver vos CV.",
  "home.choices": "Choisissez comment commencer",
  "home.recommended": "Recommandé",
  "home.importTitle": "Importez votre CV existant",
  "home.importDescription":
    "Utilisez votre CV comme point de départ. Vérifiez les informations extraites, modifiez-les, puis choisissez la présentation.",
  "home.importAction": "Importer un CV",
  "home.fresh": "Partir de zéro",
  "home.createTitle": "Créez un nouveau CV",
  "home.createDescription":
    "Ajoutez votre parcours rubrique par rubrique avec un éditeur guidé et un aperçu en direct.",
  "home.createAction": "Créer un CV",
  "home.path": "Un parcours clair, du premier brouillon au CV final",
  "home.details": "Ajoutez vos informations",
  "home.review": "Vérifiez et améliorez",
  "home.export": "Prévisualisez et exportez",
  "home.privacy":
    "Votre CV reste privé dans votre espace de travail. Vous décidez quand le télécharger.",
  "import.entry.eyebrow": "Recommandé",
  "import.entry.title": "Commencez avec votre CV existant",
  "import.entry.description":
    "Importez un CV PDF ou DOCX et Nuvitae préparera un brouillon à vérifier avant la création d’un CV structuré.",
  "import.entry.choices": "Choix de création du CV",
  "import.entry.recommendedPath": "Parcours recommandé",
  "import.entry.importTitle": "Importer un CV",
  "import.entry.importDescription":
    "Idéal si vous avez déjà un CV. Vous gardez le contrôle et vérifiez les informations importées avant de les utiliser.",
  "import.entry.importAction": "Importer mon CV",
  "import.entry.manualTitle": "Saisir manuellement",
  "import.entry.manualDescription":
    "Choisissez cette option pour commencer avec un CV vierge et remplir chaque rubrique vous-même.",
  "import.entry.manualAction": "Saisir manuellement",
  "import.upload.eyebrow": "Importation de CV",
  "import.upload.title": "Choisissez le fichier CV à importer",
  "import.upload.description":
    "Votre fichier sert uniquement à préparer un brouillon. Vous vérifierez chaque détail avant son enregistrement comme CV.",
  "import.upload.guidanceTitle": "Avant l’importation",
  "import.upload.files": "Fichiers PDF et DOCX uniquement.",
  "import.upload.languages":
    "CV en français, anglais ou bilingues français-anglais.",
  "import.upload.size": "Taille maximale : 10 Mo.",
  "import.upload.pages": "Jusqu’à 5 pages.",
  "import.upload.selectableText":
    "Le texte doit être sélectionnable, pas une numérisation ou une photo.",
  "import.upload.retention":
    "Votre fichier importé et ses copies de travail temporaires sont supprimés sous sept jours.",
  "import.upload.errorTitle": "Le fichier n’a pas pu être importé",
  "import.upload.fileLabel": "Fichier CV",
  "import.upload.dropTitle": "Déposez votre CV ici",
  "import.upload.dropHint":
    "ou choisissez un fichier PDF ou DOCX sur votre appareil",
  "import.upload.noFile": "Aucun fichier sélectionné.",
  "import.upload.selectedFile": "Fichier sélectionné :",
  "import.upload.back": "Retour",
  "import.upload.submit": "Importer et démarrer l’analyse",
  "import.upload.uploading": "Importation…",
  "import.upload.error.unsupportedExtension":
    "Choisissez un fichier CV PDF ou DOCX.",
  "import.upload.error.emptyFile": "Choisissez un fichier CV non vide.",
  "import.upload.error.tooLarge": "Choisissez un fichier CV de 10 Mo ou moins.",
  "import.upload.error.required":
    "Choisissez un fichier CV avant de commencer l’importation.",
  "import.provider.title": "Comment Codex aide à importer votre CV",
  "import.provider.connection":
    "Codex doit être connecté pour une importation la plus complète possible.",
  "import.provider.access":
    "Codex reçoit uniquement le texte de votre CV, sans accès au reste de Nuvitae.",
  "import.provider.review":
    "Rien n’est enregistré dans votre CV avant votre vérification.",
  "import.provider.verification":
    "Nuvitae vérifie les suggestions avec votre document et écarte celles qui ne peuvent pas être vérifiées.",
  "import.provider.fallback":
    "Si Codex n’est pas disponible, vous pouvez utiliser une importation limitée qui peut manquer des informations, ou saisir vos données manuellement.",
  "import.status.uploadAccepted":
    "Votre fichier a été accepté pour l’importation.",
  "import.status.validationStarted":
    "Nuvitae vérifie que votre document peut être importé.",
  "import.status.processingStarted":
    "Nuvitae prépare votre CV pour la vérification.",
  "import.status.processingProgress":
    "Nuvitae continue de préparer votre CV pour la vérification.",
  "import.processingStep.checkingDocument": "vérification du document",
  "import.processingStep.readingContent": "lecture du contenu",
  "import.processingStep.organizingResumeSections":
    "organisation des rubriques du CV",
  "import.processingStep.preparingReview": "préparation de la vérification",
  "import.processingStep.current": "Étape en cours :",
  "import.status.providerConnectionRequired":
    "Un fournisseur d’IA connecté est nécessaire pour analyser votre CV.",
  "import.status.providerUnavailable":
    "Le fournisseur d’IA est temporairement indisponible. Vous pouvez réessayer ou poursuivre avec une extraction limitée.",
  "import.status.limitedExtractionStarted":
    "L’extraction automatique limitée a commencé. Des informations peuvent manquer.",
  "import.status.partialDraftReady":
    "Un brouillon partiel est prêt à être vérifié. Certaines informations peuvent manquer.",
  "import.status.reviewReady": "Votre brouillon de CV est prêt à être vérifié.",
  "import.status.processingFailed":
    "Votre CV n’a pas pu être préparé pour vérification. Vous pouvez réessayer ou saisir les informations manuellement.",
  "import.status.retryStarted": "Nuvitae réessaie de préparer votre CV.",
  "import.status.cancellationCompleted": "L’importation a été annulée.",
  "import.status.sourceDeletionCompleted":
    "Le fichier source importé a été supprimé.",
  "import.status.unknown": "L’état de l’importation a changé.",
  "metadata.description": "Créez et améliorez votre CV avec Nuvitae Community",
  "review.warning.unsafe.title": "Informations non incluses",
  "review.warning.missing.title": "Informations à ajouter ou à exclure",
  "review.warning.ambiguous.title":
    "Choisissez comment utiliser ces informations",
  "review.warning.default.title": "Une vérification rapide est nécessaire",
  "review.warning.unsafe.message":
    "Nuvitae n’a pas pu utiliser certaines informations de votre CV en toute sécurité. Elles ont été exclues ; vous pouvez les ajouter vous-même si vous souhaitez les inclure.",
  "review.warning.missing.message":
    "Ces informations n’ont pas été ajoutées automatiquement. Vous pouvez les ajouter ou les exclure pour le moment.",
  "review.warning.message.ambiguous":
    "Ces informations peuvent avoir plusieurs sens. Vérifiez-les et choisissez celles à conserver dans votre CV.",
  "review.warning.message.conflicting":
    "Certaines informations ne concordent pas. Vérifiez-les avant de choisir ce que vous souhaitez conserver.",
  "review.warning.message.duplicate":
    "Ces informations figurent peut-être déjà ailleurs dans votre CV.",
  "review.warning.message.lowConfidence":
    "Ces informations n’ont pas pu être identifiées avec certitude. Vérifiez-les avant de les utiliser.",
  "review.warning.message.inferred":
    "Cette suggestion a été déduite de votre CV. Confirmez-la avant de l’utiliser.",
  "review.warning.message.mixedContent":
    "Cette rubrique contient différents types d’informations à vérifier.",
  "review.warning.message.expiredSource":
    "Le fichier source temporaire n’est plus disponible. Vous pouvez toujours vérifier les informations affichées ici.",
  "review.warning.message.default":
    "Ces informations doivent être vérifiées avant de continuer.",
  "review.warning.context":
    "Cela concerne les informations importées dans cette rubrique.",
  "review.warning.state": "Cet élément est",
  "review.warning.status.needsReview": "en attente de votre vérification",
  "review.warning.status.confirmed": "confirmé",
  "review.warning.status.edited": "modifié",
  "review.warning.status.excluded": "exclu",
  "review.warning.status.intentionallyLeft": "exclu pour le moment",
  "review.warning.leaveOut": "Exclure pour le moment",
  "review.warning.confirm": "Confirmer",
  "review.warning.edit": "Modifier les informations",
  "review.warning.exclude": "Exclure",
  "review.provenance.inferred":
    "Information trouvée dans votre CV — votre confirmation est nécessaire",
  "review.provenance.pdf": "Importé de la page",
  "review.provenance.docxBody": "Importé du corps du document",
  "review.provenance.docxPart": "Importé de la partie du document",
  "review.provenance.added": "Ajouté par vous",
  "review.provenance.edited": "Modifié par vous",
  "review.provenance.editedPdf":
    "Modifié par vous ; importé à l’origine de la page",
  "review.provenance.initial": "Importé du CV initial",
  "review.provenance.found": "Information trouvée dans votre CV",
  "review.confirm.title.ready": "Votre vérification est terminée",
  "review.confirm.title.remaining": "Terminez votre vérification",
  "review.confirm.status.creating": "Création de votre CV.",
  "review.confirm.status.ready": "Votre CV est prêt.",
  "review.confirm.status.discarding":
    "Planification du nettoyage de la source.",
  "review.confirm.error.heading": "L’action n’a pas pu aboutir",
  "review.confirm.ready.description":
    "Toutes les informations ont été vérifiées. Vous pouvez créer votre CV modifiable à partir des informations conservées et modifiées.",
  "review.confirm.create": "Créer mon CV",
  "review.confirm.creating": "Création de votre CV…",
  "review.confirm.remaining.heading": "Vérifiez les informations restantes",
  "review.confirm.remaining.one":
    "Un élément nécessite encore votre attention.",
  "review.confirm.remaining.many":
    "éléments nécessitent encore votre attention.",
  "review.confirm.remaining.instruction":
    "Vérifiez ces éléments avant de créer votre CV.",
  "review.confirm.discard": "Abandonner l’importation",
  "review.confirm.dialog.description":
    "Nuvitae abandonnera ce brouillon non confirmé et planifiera le nettoyage de la source. La suppression ne sera pas immédiate et cette action ne supprimera pas un CV déjà confirmé.",
  "review.confirm.working": "En cours",
  "review.confirm.cancel": "Annuler",
  "review.confirm.discarded":
    "L’importation a été abandonnée. Le nettoyage de la source a été planifié.",
  "review.confirm.error.authentication":
    "Votre session n’a pas pu être vérifiée. Reconnectez-vous et réessayez.",
  "review.confirm.error.notFound": "Cette importation n’est plus disponible.",
  "review.confirm.error.notReady":
    "Cette importation n’est pas encore prête à créer un CV.",
  "review.confirm.error.unresolved":
    "Vérifiez les informations restantes avant de créer votre CV.",
  "review.confirm.error.noConfirmedField":
    "Confirmez au moins une information avant de créer votre CV.",
  "review.confirm.error.content":
    "Certaines informations vérifiées n’ont pas pu servir à créer le CV. Vérifiez-les et réessayez.",
  "review.confirm.error.staleUpdate":
    "Votre CV a changé pendant l’enregistrement. Rechargez-le et réessayez.",
  "review.confirm.error.expired": "Cette importation a expiré.",
  "review.confirm.error.concurrent":
    "La création de ce CV est déjà en cours. Patientez un instant et vérifiez à nouveau.",
  "review.confirm.error.unavailable":
    "Cette action est temporairement indisponible. Réessayez plus tard.",
  "review.confirm.error.cancelled": "La demande a été arrêtée.",
  "review.confirm.error.generic":
    "L’action n’a pas pu aboutir. Réessayez plus tard.",
  "review.confirm.destructive": "Action destructive",
  "review.minimum.loading": "Chargement de la vérification",
  "review.minimum.eyebrow": "Vérification du CV",
  "review.minimum.loadingStatus": "Chargement des informations de votre CV.",
  "review.minimum.unavailable": "Vérification indisponible",
  "review.minimum.title":
    "Vérifiez les informations que Nuvitae vous demande de confirmer",
  "review.minimum.sourceNote":
    "Vous vérifiez un brouillon structuré. Votre fichier importé reste inchangé.",
  "review.error.stale":
    "Votre vérification a changé. Nous avons rechargé les dernières informations.",
  "review.minimum.loaded": "Vérification chargée.",
  "review.update.saving": "Enregistrement de votre vérification…",
  "review.update.saved": "Modifications enregistrées.",
  "review.update.linkedWarningFailed":
    "Votre confirmation a été enregistrée, mais un élément associé nécessite encore votre attention.",
  "review.update.error.heading": "La modification n’a pas pu être enregistrée",
  "review.update.error.authentication":
    "Connectez-vous pour continuer la vérification de cette importation.",
  "review.update.error.notFound":
    "Cette importation n’est pas disponible ou n’est plus accessible.",
  "review.update.error.notReady":
    "Cette importation n’est pas encore prête à être vérifiée.",
  "review.update.error.expired": "Cette importation a expiré.",
  "review.update.error.rateLimited":
    "Trop de modifications ont été envoyées. Patientez puis réessayez.",
  "review.update.error.unavailable":
    "La vérification est temporairement indisponible. Réessayez plus tard.",
  "review.update.error.malformed":
    "La réponse de vérification n’a pas pu être lue en toute sécurité. Réessayez plus tard.",
  "review.update.error.cancelled": "La demande de vérification a été arrêtée.",
  "review.update.error.generic":
    "La demande de vérification n’a pas abouti. Réessayez plus tard.",
  "review.finalized.openResume": "Ouvrir mon CV",
  "review.finalized.newImport": "Démarrer une nouvelle importation",
  "review.finalized.manual": "Continuer manuellement",
};

const es: Messages = {
  "import.processing.eyebrow": "Estado de la importación",
  "import.processing.problem": "Se ha producido un problema",
  "import.processing.loading.experience": "Un último vistazo a tu experiencia…",
  "import.processing.loading.bullets":
    "Comprobando que las viñetas se porten bien…",
  "import.processing.loading.surprises": "Buscando sorpresas en tu documento…",
  "import.processing.loading.dates":
    "Buscando fechas que hayan viajado en el tiempo…",
  "import.processing.loading.sections":
    "Desenredando el documento, sección por sección…",
  "import.processing.loading.polishing":
    "Puliendo los detalles sin inventar un ascenso…",
  "import.processing.longWait":
    "Está tardando un poco más. Seguiremos mostrando el último paso del procesamiento.",
  "import.processing.draftFields": "Campos del borrador",
  "import.processing.needsAttention": "Requiere atención",
  "import.processing.review": "Revisar el currículum importado",
  "import.processing.openReview": "Abrir la página de revisión",
  "import.processing.replacementNotice":
    "Si subes otro archivo, la importación anterior no se elimina aquí y mantiene su plazo de conservación original.",
  "import.processing.replaceUpload": "Subir otro archivo",
  "import.processing.heading.processing":
    "Preparando tu currículum para la revisión",
  "import.processing.heading.draft_ready":
    "El borrador de tu currículum está listo",
  "import.processing.heading.partial_extraction":
    "El borrador de tu currículum está listo con observaciones",
  "import.processing.heading.recoverable_timeout":
    "Está tardando más de lo esperado",
  "import.processing.heading.validation_failure":
    "No se puede importar este archivo",
  "import.processing.heading.terminal_processing_failure":
    "No se pudo preparar este currículum",
  "import.processing.heading.authentication_required": "Debes iniciar sesión",
  "import.processing.heading.connectivity_lost":
    "Conexión perdida temporalmente",
  "import.processing.heading.not_found": "Importación no disponible",
  "import.processing.heading.expired": "Importación caducada",
  "import.processing.heading.cancelled": "Importación detenida",
  "import.sourceDeletion.heading": "Archivo fuente cargado",
  "import.sourceDeletion.summary":
    "El archivo que has cargado es temporal y está separado de tu currículum estructurado. Al eliminarlo, se conservan este currículum y todos tus cambios.",
  "import.sourceDeletion.action": "Eliminar el archivo fuente cargado",
  "import.sourceDeletion.dialogTitle": "¿Eliminar el archivo fuente cargado?",
  "import.sourceDeletion.dialogDescription":
    "Esta acción elimina permanentemente el archivo cargado y los elementos asociados a la fuente. No elimina tu currículum estructurado ni tus cambios.",
  "import.sourceDeletion.confirm": "Eliminar solo la fuente",
  "import.sourceDeletion.pending": "Eliminando la fuente",
  "import.sourceDeletion.destructiveMarker": "Acción destructiva",
  "import.sourceDeletion.cancel": "Conservar la fuente",
  "import.sourceDeletion.error":
    "No se pudo eliminar el archivo fuente cargado. Inténtalo de nuevo más tarde.",
  "shell.home": "Inicio",
  "shell.resumes": "Mis currículums",
  "shell.import": "Importar currículum",
  "shell.create": "Crear currículum",
  "shell.skip": "Ir al contenido",
  "shell.brand": "Inicio de Nuvitae",
  "shell.navigation": "Navegación principal",
  "shell.language": "Idioma de la aplicación",
  "shell.changed":
    "El idioma de la aplicación ha cambiado. Tu currículum no se ha modificado.",
  "home.eyebrow": "Tu próxima oportunidad empieza aquí",
  "home.title": "Crea un currículum que te dé confianza enviar.",
  "home.lede":
    "Importa un currículum o empieza de cero. Tú controlas cada detalle antes de exportarlo.",
  "home.signIn":
    "Inicia sesión desde la cabecera para guardar y recuperar tus currículums.",
  "home.choices": "Elige cómo empezar",
  "home.recommended": "Recomendado",
  "home.importTitle": "Importa tu currículum actual",
  "home.importDescription":
    "Usa tu currículum como punto de partida. Revisa la información extraída, haz cambios y elige su presentación.",
  "home.importAction": "Importar un currículum",
  "home.fresh": "Empezar de cero",
  "home.createTitle": "Crea un currículum desde cero",
  "home.createDescription":
    "Añade tu experiencia sección por sección con un editor guiado y una vista previa en directo.",
  "home.createAction": "Crear un currículum",
  "home.path": "Un camino claro del primer borrador al currículum final",
  "home.details": "Añade tus datos",
  "home.review": "Revisa y mejora",
  "home.export": "Previsualiza y exporta",
  "home.privacy":
    "Tu currículum se mantiene privado en tu espacio de trabajo. Tú decides cuándo descargarlo.",
  "import.entry.eyebrow": "Recomendado",
  "import.entry.title": "Empieza con tu currículum actual",
  "import.entry.description":
    "Sube un currículum PDF o DOCX y Nuvitae preparará un borrador para que lo revises antes de crear un currículum estructurado.",
  "import.entry.choices": "Opciones para crear el currículum",
  "import.entry.recommendedPath": "Opción recomendada",
  "import.entry.importTitle": "Importar un currículum",
  "import.entry.importDescription":
    "La mejor opción si ya tienes un currículum. Mantienes el control y revisas la información importada antes de usarla.",
  "import.entry.importAction": "Importar mi currículum",
  "import.entry.manualTitle": "Introducirlo manualmente",
  "import.entry.manualDescription":
    "Elige esta opción si prefieres empezar con un currículum en blanco y completar cada sección.",
  "import.entry.manualAction": "Introducir manualmente",
  "import.upload.eyebrow": "Importación de currículum",
  "import.upload.title": "Elige el archivo de currículum que quieres importar",
  "import.upload.description":
    "Tu archivo se usa solo para preparar un borrador. Revisarás cada detalle antes de guardarlo como currículum.",
  "import.upload.guidanceTitle": "Antes de subirlo",
  "import.upload.files": "Solo archivos PDF y DOCX.",
  "import.upload.languages":
    "Currículums en francés, inglés o bilingües francés-inglés.",
  "import.upload.size": "Tamaño máximo de archivo: 10 MB.",
  "import.upload.pages": "Hasta 5 páginas.",
  "import.upload.selectableText":
    "El texto debe poder seleccionarse; no puede ser un escaneo o una foto.",
  "import.upload.retention":
    "El archivo subido y las copias temporales se eliminan en un plazo de siete días.",
  "import.upload.errorTitle": "No se pudo subir el archivo",
  "import.upload.fileLabel": "Archivo de currículum",
  "import.upload.dropTitle": "Suelta aquí tu currículum",
  "import.upload.dropHint": "o elige un archivo PDF o DOCX de tu dispositivo",
  "import.upload.noFile": "No se ha seleccionado ningún archivo.",
  "import.upload.selectedFile": "Archivo seleccionado:",
  "import.upload.back": "Atrás",
  "import.upload.submit": "Subir e iniciar la importación",
  "import.upload.uploading": "Subiendo…",
  "import.upload.error.unsupportedExtension":
    "Elige un archivo de currículum PDF o DOCX.",
  "import.upload.error.emptyFile":
    "Elige un archivo de currículum que no esté vacío.",
  "import.upload.error.tooLarge":
    "Elige un archivo de currículum de 10 MB o menos.",
  "import.upload.error.required":
    "Elige un archivo de currículum antes de iniciar la importación.",
  "import.provider.title": "Cómo ayuda Codex con tu importación",
  "import.provider.connection":
    "Codex debe estar conectado para realizar la importación más completa.",
  "import.provider.access":
    "Codex recibe solo el texto de tu currículum, no acceso a nada más en Nuvitae.",
  "import.provider.review":
    "No se guarda nada en tu currículum hasta que lo revises.",
  "import.provider.verification":
    "Nuvitae comprueba las sugerencias con tu documento y omite todo lo que no pueda verificarse.",
  "import.provider.fallback":
    "Si Codex no está disponible, puedes usar una importación limitada que podría no incluir toda la información o introducir tus datos manualmente.",
  "import.status.uploadAccepted": "Tu archivo se ha aceptado para importarlo.",
  "import.status.validationStarted":
    "Nuvitae está comprobando que tu documento se puede importar.",
  "import.status.processingStarted":
    "Nuvitae está preparando tu currículum para revisarlo.",
  "import.status.processingProgress":
    "Nuvitae sigue preparando tu currículum para revisarlo.",
  "import.processingStep.checkingDocument": "comprobando el documento",
  "import.processingStep.readingContent": "leyendo el contenido",
  "import.processingStep.organizingResumeSections":
    "organizando las secciones del currículum",
  "import.processingStep.preparingReview": "preparando la revisión",
  "import.processingStep.current": "Paso actual:",
  "import.status.providerConnectionRequired":
    "Se necesita un proveedor de IA conectado para analizar tu currículum.",
  "import.status.providerUnavailable":
    "El proveedor de IA no está disponible temporalmente. Puedes volver a intentarlo o continuar con una extracción limitada.",
  "import.status.limitedExtractionStarted":
    "La extracción automática limitada ha comenzado. Puede que falte información.",
  "import.status.partialDraftReady":
    "Hay un borrador parcial listo para revisar. Puede que falte información.",
  "import.status.reviewReady":
    "El borrador de tu currículum está listo para revisar.",
  "import.status.processingFailed":
    "No se ha podido preparar tu currículum para revisarlo. Puedes volver a intentarlo o introducir la información manualmente.",
  "import.status.retryStarted":
    "Nuvitae está intentando preparar tu currículum de nuevo.",
  "import.status.cancellationCompleted": "Se ha cancelado la importación.",
  "import.status.sourceDeletionCompleted":
    "Se ha eliminado el archivo fuente subido.",
  "import.status.unknown": "El estado de la importación ha cambiado.",
  "metadata.description": "Crea y mejora tu currículum con Nuvitae Community",
  "review.warning.unsafe.title": "Información no incluida",
  "review.warning.missing.title": "Información para añadir o excluir",
  "review.warning.ambiguous.title": "Elige cómo usar esta información",
  "review.warning.default.title": "Se necesita una revisión rápida",
  "review.warning.unsafe.message":
    "Nuvitae no pudo usar de forma segura cierta información de tu currículum. Se excluyó; puedes añadirla tú si quieres incluirla.",
  "review.warning.missing.message":
    "Esta información no se añadió automáticamente. Puedes añadirla o excluirla por ahora.",
  "review.warning.message.ambiguous":
    "Esta información puede tener más de un significado. Revísala y elige qué incluir en tu currículum.",
  "review.warning.message.conflicting":
    "Parte de la información no coincide. Revísala antes de decidir qué conservar.",
  "review.warning.message.duplicate":
    "Es posible que esta información ya aparezca en otra parte de tu currículum.",
  "review.warning.message.lowConfidence":
    "No se pudo identificar esta información con seguridad. Compruébala antes de usarla.",
  "review.warning.message.inferred":
    "Esta sugerencia se dedujo de tu currículum. Confírmala antes de usarla.",
  "review.warning.message.mixedContent":
    "Esta sección contiene distintos tipos de información que debes revisar.",
  "review.warning.message.expiredSource":
    "El archivo fuente temporal ya no está disponible. Aun así, puedes revisar la información que aparece aquí.",
  "review.warning.message.default":
    "Debes revisar esta información antes de continuar.",
  "review.warning.context":
    "Esto se refiere a información importada en esta sección.",
  "review.warning.state": "Este elemento está",
  "review.warning.status.needsReview": "pendiente de revisión",
  "review.warning.status.confirmed": "confirmado",
  "review.warning.status.edited": "editado",
  "review.warning.status.excluded": "excluido",
  "review.warning.status.intentionallyLeft": "excluido por ahora",
  "review.warning.leaveOut": "Excluir por ahora",
  "review.warning.confirm": "Confirmar",
  "review.warning.edit": "Editar información",
  "review.warning.exclude": "Excluir",
  "review.provenance.inferred":
    "Encontrado en tu currículum — debes confirmarlo",
  "review.provenance.pdf": "Importado de la página",
  "review.provenance.docxBody": "Importado del cuerpo del documento",
  "review.provenance.docxPart": "Importado de la parte del documento",
  "review.provenance.added": "Añadido por ti",
  "review.provenance.edited": "Editado por ti",
  "review.provenance.editedPdf":
    "Editado por ti; importado originalmente de la página",
  "review.provenance.initial": "Importado del currículum inicial",
  "review.provenance.found": "Encontrado en tu currículum",
  "review.confirm.title.ready": "Has terminado la revisión",
  "review.confirm.title.remaining": "Termina la revisión",
  "review.confirm.status.creating": "Creando tu currículum.",
  "review.confirm.status.ready": "Tu currículum está listo.",
  "review.confirm.status.discarding":
    "Programando la limpieza del archivo fuente.",
  "review.confirm.error.heading": "No se pudo completar la acción",
  "review.confirm.ready.description":
    "Has revisado todos los detalles. Continúa para crear tu currículum editable con la información que conservaste y modificaste.",
  "review.confirm.create": "Crear mi currículum",
  "review.confirm.creating": "Creando tu currículum…",
  "review.confirm.remaining.heading": "Revisa los detalles pendientes",
  "review.confirm.remaining.one": "1 detalle todavía requiere tu atención.",
  "review.confirm.remaining.many": "detalles todavía requieren tu atención.",
  "review.confirm.remaining.instruction":
    "Revisa estos elementos antes de crear tu currículum.",
  "review.confirm.discard": "Descartar importación",
  "review.confirm.dialog.description":
    "Nuvitae descartará este borrador sin confirmar y programará la limpieza del archivo fuente. La eliminación no será inmediata y esta acción no eliminará un currículum ya confirmado.",
  "review.confirm.working": "En curso",
  "review.confirm.cancel": "Cancelar",
  "review.confirm.discarded":
    "Se descartó la importación. Se programó la limpieza del archivo fuente.",
  "review.confirm.error.authentication":
    "No se pudo verificar tu sesión. Inicia sesión de nuevo e inténtalo otra vez.",
  "review.confirm.error.notFound": "Esta importación ya no está disponible.",
  "review.confirm.error.notReady":
    "Esta importación aún no está lista para crear un currículum.",
  "review.confirm.error.unresolved":
    "Revisa la información pendiente antes de crear el currículum.",
  "review.confirm.error.noConfirmedField":
    "Confirma al menos un detalle antes de crear el currículum.",
  "review.confirm.error.content":
    "No se pudo usar parte de la información revisada para crear el currículum. Revísala e inténtalo de nuevo.",
  "review.confirm.error.staleUpdate":
    "Tu currículum cambió mientras se guardaba la actualización. Recárgalo e inténtalo de nuevo.",
  "review.confirm.error.expired": "Esta importación ha caducado.",
  "review.confirm.error.concurrent":
    "Ya se está creando este currículum. Espera un momento y vuelve a comprobarlo.",
  "review.confirm.error.unavailable":
    "Esta acción no está disponible temporalmente. Inténtalo más tarde.",
  "review.confirm.error.cancelled": "Se detuvo la solicitud.",
  "review.confirm.error.generic":
    "No se pudo completar la acción. Inténtalo más tarde.",
  "review.confirm.destructive": "Acción destructiva",
  "review.minimum.loading": "Cargando la revisión de la importación",
  "review.minimum.eyebrow": "Revisión del currículum",
  "review.minimum.loadingStatus": "Cargando la información de tu currículum.",
  "review.minimum.unavailable": "Revisión no disponible",
  "review.minimum.title":
    "Revisa la información que Nuvitae necesita que confirmes",
  "review.minimum.sourceNote":
    "Estás revisando un borrador estructurado. El archivo que subiste no cambia.",
  "review.error.stale":
    "Tu revisión ha cambiado. Hemos vuelto a cargar la información más reciente.",
  "review.minimum.loaded": "Revisión cargada.",
  "review.update.saving": "Guardando la revisión…",
  "review.update.saved": "Cambios guardados.",
  "review.update.linkedWarningFailed":
    "Se guardó tu confirmación, pero otro elemento relacionado aún requiere tu atención.",
  "review.update.error.heading": "No se pudo guardar el cambio",
  "review.update.error.authentication":
    "Inicia sesión para seguir revisando esta importación.",
  "review.update.error.notFound":
    "Esta importación no está disponible o ya no se puede consultar.",
  "review.update.error.notReady":
    "Esta importación aún no está lista para revisarse.",
  "review.update.error.expired": "Esta importación ha caducado.",
  "review.update.error.rateLimited":
    "Se enviaron demasiados cambios. Espera e inténtalo de nuevo.",
  "review.update.error.unavailable":
    "La revisión no está disponible temporalmente. Inténtalo más tarde.",
  "review.update.error.malformed":
    "No se pudo leer la respuesta de revisión de forma segura. Inténtalo más tarde.",
  "review.update.error.cancelled": "Se detuvo la solicitud de revisión.",
  "review.update.error.generic":
    "No se pudo completar la solicitud de revisión. Inténtalo más tarde.",
  "review.finalized.openResume": "Abrir mi currículum",
  "review.finalized.newImport": "Iniciar una nueva importación",
  "review.finalized.manual": "Continuar manualmente",
};

const ar: Messages = {
  "import.processing.eyebrow": "حالة الاستيراد",
  "import.processing.problem": "حدثت مشكلة",
  "import.processing.loading.experience": "نلقي نظرة أخيرة على خبراتك…",
  "import.processing.loading.bullets": "نتأكد من ترتيب النقاط في سيرتك…",
  "import.processing.loading.surprises": "نبحث عن أي مفاجآت في مستندك…",
  "import.processing.loading.dates":
    "نتحقق من التواريخ التي ربما سافرت عبر الزمن…",
  "import.processing.loading.sections": "نرتب المستند قسمًا تلو الآخر…",
  "import.processing.loading.polishing": "نحسّن التفاصيل دون اختراع ترقية…",
  "import.processing.longWait":
    "يستغرق هذا وقتًا أطول قليلًا. سنواصل عرض أحدث خطوة في المعالجة.",
  "import.processing.draftFields": "حقول المسودة",
  "import.processing.needsAttention": "تحتاج إلى مراجعة",
  "import.processing.review": "مراجعة السيرة الذاتية المستوردة",
  "import.processing.openReview": "فتح صفحة المراجعة",
  "import.processing.replacementNotice":
    "إذا رفعت ملفًا بديلًا، فلن يُحذف الاستيراد السابق هنا وسيبقى خاضعًا لموعد الاحتفاظ الأصلي.",
  "import.processing.replaceUpload": "رفع ملف آخر",
  "import.processing.heading.processing": "جارٍ تحضير سيرتك الذاتية للمراجعة",
  "import.processing.heading.draft_ready": "مسودة سيرتك الذاتية جاهزة",
  "import.processing.heading.partial_extraction":
    "مسودة سيرتك الذاتية جاهزة مع ملاحظات",
  "import.processing.heading.recoverable_timeout":
    "يستغرق هذا وقتًا أطول من المتوقع",
  "import.processing.heading.validation_failure": "لا يمكن استيراد هذا الملف",
  "import.processing.heading.terminal_processing_failure":
    "تعذّر تحضير هذه السيرة الذاتية",
  "import.processing.heading.authentication_required": "يجب تسجيل الدخول",
  "import.processing.heading.connectivity_lost": "انقطع الاتصال مؤقتًا",
  "import.processing.heading.not_found": "الاستيراد غير متاح",
  "import.processing.heading.expired": "انتهت صلاحية الاستيراد",
  "import.processing.heading.cancelled": "توقف الاستيراد",
  "import.sourceDeletion.heading": "الملف المصدر الذي تم تحميله",
  "import.sourceDeletion.summary":
    "ملفك الذي تم تحميله مؤقت ومنفصل عن سيرتك الذاتية المنظمة. حذفه يُبقي هذه السيرة الذاتية وكل تعديلاتك.",
  "import.sourceDeletion.action": "حذف الملف المصدر الذي تم تحميله",
  "import.sourceDeletion.dialogTitle":
    "هل تريد حذف الملف المصدر الذي تم تحميله؟",
  "import.sourceDeletion.dialogDescription":
    "سيؤدي ذلك نهائيًا إلى حذف الملف الذي تم تحميله والعناصر المرتبطة بالمصدر فقط. ولن يحذف سيرتك الذاتية المنظمة أو تعديلاتك.",
  "import.sourceDeletion.confirm": "حذف المصدر فقط",
  "import.sourceDeletion.pending": "جارٍ حذف المصدر",
  "import.sourceDeletion.destructiveMarker": "إجراء حذف",
  "import.sourceDeletion.cancel": "الاحتفاظ بالمصدر",
  "import.sourceDeletion.error":
    "تعذر حذف الملف المصدر الذي تم تحميله. حاول مرة أخرى لاحقًا.",
  "shell.home": "الرئيسية",
  "shell.resumes": "سيري الذاتية",
  "shell.import": "استيراد سيرة ذاتية",
  "shell.create": "إنشاء سيرة ذاتية",
  "shell.skip": "انتقل إلى المحتوى",
  "shell.brand": "صفحة Nuvitae الرئيسية",
  "shell.navigation": "التنقل الرئيسي",
  "shell.language": "لغة التطبيق",
  "shell.changed": "تم تغيير لغة التطبيق. لم تتغير سيرتك الذاتية.",
  "home.eyebrow": "فرصتك القادمة تبدأ هنا",
  "home.title": "أنشئ سيرة ذاتية ترسلها بثقة.",
  "home.lede":
    "استورد سيرة ذاتية أو ابدأ من الصفر. أنت تتحكم في كل التفاصيل قبل التصدير.",
  "home.signIn": "سجّل الدخول من أعلى الصفحة لحفظ سيرك الذاتية والعودة إليها.",
  "home.choices": "اختر طريقة البدء",
  "home.recommended": "موصى به",
  "home.importTitle": "استورد سيرتك الذاتية الحالية",
  "home.importDescription":
    "استخدم سيرتك الذاتية كنقطة انطلاق. راجع المعلومات المستخرجة وعدّلها، ثم اختر شكل العرض.",
  "home.importAction": "استيراد سيرة ذاتية",
  "home.fresh": "ابدأ من الصفر",
  "home.createTitle": "أنشئ سيرة ذاتية من الصفر",
  "home.createDescription":
    "أضف خبراتك قسمًا بعد قسم باستخدام محرر إرشادي ومعاينة مباشرة.",
  "home.createAction": "إنشاء سيرة ذاتية",
  "home.path": "خطوات واضحة من المسودة الأولى إلى السيرة الذاتية النهائية",
  "home.details": "أضف معلوماتك",
  "home.review": "راجع وحسّن",
  "home.export": "عاين وصدّر",
  "home.privacy":
    "تبقى سيرتك الذاتية خاصة في مساحة عملك. أنت تقرر متى تصبح جاهزة للتنزيل.",
  "import.entry.eyebrow": "موصى به",
  "import.entry.title": "ابدأ بسيرتك الذاتية الحالية",
  "import.entry.description":
    "حمّل سيرة ذاتية بصيغة PDF أو DOCX وسيُعد Nuvitae مسودة لمراجعتها قبل إنشاء سيرة ذاتية منظمة.",
  "import.entry.choices": "خيارات إنشاء السيرة الذاتية",
  "import.entry.recommendedPath": "المسار الموصى به",
  "import.entry.importTitle": "استيراد سيرة ذاتية",
  "import.entry.importDescription":
    "الخيار الأفضل إذا كانت لديك سيرة ذاتية. تبقى متحكمًا وتراجع المعلومات المستوردة قبل استخدامها.",
  "import.entry.importAction": "استيراد سيرتي الذاتية",
  "import.entry.manualTitle": "إدخالها يدويًا",
  "import.entry.manualDescription":
    "اختر هذا الخيار إذا كنت تفضل البدء بسيرة ذاتية فارغة وملء كل قسم بنفسك.",
  "import.entry.manualAction": "إدخال يدويًا",
  "import.upload.eyebrow": "استيراد السيرة الذاتية",
  "import.upload.title": "اختر ملف السيرة الذاتية لاستيراده",
  "import.upload.description":
    "يُستخدم ملفك لإعداد مسودة فقط. ستراجع كل التفاصيل قبل حفظها كسيرة ذاتية.",
  "import.upload.guidanceTitle": "قبل التحميل",
  "import.upload.files": "ملفات PDF وDOCX فقط.",
  "import.upload.languages":
    "السير الذاتية بالفرنسية أو الإنجليزية أو باللغتين الفرنسية والإنجليزية.",
  "import.upload.size": "الحد الأقصى لحجم الملف هو 10 ميغابايت.",
  "import.upload.pages": "حتى 5 صفحات.",
  "import.upload.selectableText":
    "يجب أن يكون النص قابلاً للتحديد، وليس مسحًا ضوئيًا أو صورة.",
  "import.upload.retention":
    "يُزال الملف المرفوع والنسخ المؤقتة خلال سبعة أيام.",
  "import.upload.errorTitle": "تعذر تحميل الملف",
  "import.upload.fileLabel": "ملف السيرة الذاتية",
  "import.upload.dropTitle": "أفلت سيرتك الذاتية هنا",
  "import.upload.dropHint": "أو اختر ملف PDF أو DOCX من جهازك",
  "import.upload.noFile": "لم يتم اختيار ملف.",
  "import.upload.selectedFile": "الملف المحدد:",
  "import.upload.back": "رجوع",
  "import.upload.submit": "تحميل وبدء الاستيراد",
  "import.upload.uploading": "جارٍ التحميل…",
  "import.upload.error.unsupportedExtension":
    "اختر ملف سيرة ذاتية بصيغة PDF أو DOCX.",
  "import.upload.error.emptyFile": "اختر ملف سيرة ذاتية غير فارغ.",
  "import.upload.error.tooLarge":
    "اختر ملف سيرة ذاتية بحجم 10 ميغابايت أو أقل.",
  "import.upload.error.required": "اختر ملف سيرة ذاتية قبل بدء الاستيراد.",
  "import.provider.title": "كيف يساعد Codex في استيراد سيرتك الذاتية",
  "import.provider.connection":
    "يجب توصيل Codex لإجراء الاستيراد الأكثر اكتمالاً.",
  "import.provider.access":
    "يتلقى Codex نص سيرتك الذاتية فقط، ولا يصل إلى أي شيء آخر في Nuvitae.",
  "import.provider.review": "لا يُحفظ شيء في سيرتك الذاتية قبل مراجعته.",
  "import.provider.verification":
    "يتحقق Nuvitae من الاقتراحات مقابل مستندك ويستبعد ما لا يمكن التحقق منه.",
  "import.provider.fallback":
    "إذا لم يكن Codex متاحًا، يمكنك استخدام استيراد محدود قد يفوّت بعض المعلومات أو إدخال التفاصيل يدويًا.",
  "import.status.uploadAccepted": "تم قبول ملفك للاستيراد.",
  "import.status.validationStarted": "يتحقق Nuvitae من إمكانية استيراد مستندك.",
  "import.status.processingStarted": "يُعِد Nuvitae سيرتك الذاتية للمراجعة.",
  "import.status.processingProgress":
    "لا يزال Nuvitae يُعِد سيرتك الذاتية للمراجعة.",
  "import.processingStep.checkingDocument": "جارٍ التحقق من المستند",
  "import.processingStep.readingContent": "جارٍ قراءة المحتوى",
  "import.processingStep.organizingResumeSections":
    "جارٍ تنظيم أقسام السيرة الذاتية",
  "import.processingStep.preparingReview": "جارٍ إعداد المراجعة",
  "import.processingStep.current": "الخطوة الحالية:",
  "import.status.providerConnectionRequired":
    "يلزم موفر ذكاء اصطناعي متصل لتحليل سيرتك الذاتية.",
  "import.status.providerUnavailable":
    "موفر الذكاء الاصطناعي غير متاح مؤقتًا. يمكنك المحاولة مرة أخرى أو المتابعة باستخراج محدود.",
  "import.status.limitedExtractionStarted":
    "بدأ الاستخراج التلقائي المحدود. قد تفوت بعض المعلومات.",
  "import.status.partialDraftReady":
    "مسودة جزئية جاهزة للمراجعة. قد تكون بعض المعلومات مفقودة.",
  "import.status.reviewReady": "مسودة سيرتك الذاتية جاهزة للمراجعة.",
  "import.status.processingFailed":
    "تعذر إعداد سيرتك الذاتية للمراجعة. يمكنك المحاولة مرة أخرى أو إدخال المعلومات يدويًا.",
  "import.status.retryStarted": "يحاول Nuvitae إعداد سيرتك الذاتية مرة أخرى.",
  "import.status.cancellationCompleted": "تم إلغاء الاستيراد.",
  "import.status.sourceDeletionCompleted":
    "تمت إزالة الملف المصدر الذي تم تحميله.",
  "import.status.unknown": "تغيرت حالة الاستيراد.",
  "metadata.description":
    "أنشئ سيرتك الذاتية وحسّنها باستخدام Nuvitae Community",
  "review.warning.unsafe.title": "معلومات غير مُدرجة",
  "review.warning.missing.title": "معلومات لإضافتها أو استبعادها",
  "review.warning.ambiguous.title": "اختر كيفية استخدام هذه المعلومات",
  "review.warning.default.title": "تلزم مراجعة سريعة",
  "review.warning.unsafe.message":
    "لم يتمكن Nuvitae من استخدام بعض المعلومات من سيرتك الذاتية بأمان. تم استبعادها؛ ويمكنك إضافتها بنفسك إذا أردت إدراجها.",
  "review.warning.missing.message":
    "لم تتم إضافة هذه المعلومات تلقائيًا. يمكنك إضافتها أو استبعادها الآن.",
  "review.warning.message.ambiguous":
    "قد تحتمل هذه المعلومات أكثر من معنى. راجعها واختر ما تريد إدراجه في سيرتك الذاتية.",
  "review.warning.message.conflicting":
    "بعض المعلومات غير متطابقة. راجع التفاصيل قبل اختيار ما تريد الاحتفاظ به.",
  "review.warning.message.duplicate":
    "قد تكون هذه المعلومات موجودة بالفعل في موضع آخر من سيرتك الذاتية.",
  "review.warning.message.lowConfidence":
    "تعذّر تحديد هذه المعلومات بثقة. يُرجى التحقق منها قبل استخدامها.",
  "review.warning.message.inferred":
    "تم استنتاج هذا الاقتراح من سيرتك الذاتية. أكّده قبل استخدامه.",
  "review.warning.message.mixedContent":
    "يحتوي هذا القسم على أنواع مختلفة من المعلومات التي تحتاج إلى مراجعتك.",
  "review.warning.message.expiredSource":
    "لم يعد الملف المصدر المؤقت متاحًا. لا يزال بإمكانك مراجعة المعلومات المعروضة هنا.",
  "review.warning.message.default":
    "تحتاج هذه المعلومات إلى مراجعتك قبل المتابعة.",
  "review.warning.context": "يتعلق هذا بمعلومات مستوردة في هذا القسم.",
  "review.warning.state": "هذه المعلومة",
  "review.warning.status.needsReview": "بانتظار مراجعتك",
  "review.warning.status.confirmed": "مؤكدة",
  "review.warning.status.edited": "معدّلة",
  "review.warning.status.excluded": "مستبعدة",
  "review.warning.status.intentionallyLeft": "متروكة الآن",
  "review.warning.leaveOut": "استبعاد الآن",
  "review.warning.confirm": "تأكيد",
  "review.warning.edit": "تعديل المعلومات",
  "review.warning.exclude": "استبعاد",
  "review.provenance.inferred": "وُجدت في سيرتك الذاتية — يلزم تأكيدك",
  "review.provenance.pdf": "مستورد من الصفحة",
  "review.provenance.docxBody": "مستورد من متن المستند",
  "review.provenance.docxPart": "مستورد من جزء المستند",
  "review.provenance.added": "أُضيفت بواسطتك",
  "review.provenance.edited": "عدّلتها أنت",
  "review.provenance.editedPdf": "عدّلتها أنت؛ واستُوردت أصلًا من الصفحة",
  "review.provenance.initial": "مستورد من السيرة الذاتية الأصلية",
  "review.provenance.found": "وُجدت في سيرتك الذاتية",
  "review.confirm.title.ready": "اكتملت مراجعتك",
  "review.confirm.title.remaining": "أكمل مراجعتك",
  "review.confirm.status.creating": "جارٍ إنشاء سيرتك الذاتية.",
  "review.confirm.status.ready": "سيرتك الذاتية جاهزة.",
  "review.confirm.status.discarding": "جارٍ جدولة تنظيف المصدر.",
  "review.confirm.error.heading": "تعذر إكمال الإجراء",
  "review.confirm.ready.description":
    "اكتملت مراجعة كل التفاصيل. تابع لإنشاء سيرتك الذاتية القابلة للتعديل باستخدام المعلومات التي أبقيتها وعدّلتها.",
  "review.confirm.create": "إنشاء سيرتي الذاتية",
  "review.confirm.creating": "جارٍ إنشاء سيرتك الذاتية…",
  "review.confirm.remaining.heading": "راجع التفاصيل المتبقية",
  "review.confirm.remaining.one":
    "لا تزال هناك معلومة واحدة تحتاج إلى انتباهك.",
  "review.confirm.remaining.many": "معلومات لا تزال تحتاج إلى انتباهك.",
  "review.confirm.remaining.instruction":
    "راجع هذه العناصر قبل إنشاء سيرتك الذاتية.",
  "review.confirm.discard": "تجاهل الاستيراد",
  "review.confirm.dialog.description":
    "سيتجاهل Nuvitae هذه المسودة غير المؤكدة ويجدول تنظيف المصدر. لن يكتمل الحذف فورًا، ولن يحذف هذا الإجراء سيرة ذاتية تم تأكيدها بالفعل.",
  "review.confirm.working": "جارٍ العمل",
  "review.confirm.cancel": "إلغاء",
  "review.confirm.discarded": "تم تجاهل الاستيراد. تمت جدولة تنظيف المصدر.",
  "review.confirm.error.authentication":
    "تعذّر التحقق من جلستك. سجّل الدخول مرة أخرى ثم حاول مجددًا.",
  "review.confirm.error.notFound": "لم يعد هذا الاستيراد متاحًا.",
  "review.confirm.error.notReady":
    "هذا الاستيراد غير جاهز بعد لإنشاء سيرة ذاتية.",
  "review.confirm.error.unresolved":
    "راجع المعلومات المتبقية قبل إنشاء سيرتك الذاتية.",
  "review.confirm.error.noConfirmedField":
    "أكّد معلومة واحدة على الأقل قبل إنشاء سيرتك الذاتية.",
  "review.confirm.error.content":
    "تعذّر استخدام بعض المعلومات التي راجعتها لإنشاء السيرة الذاتية. راجعها ثم حاول مجددًا.",
  "review.confirm.error.staleUpdate":
    "تغيّرت سيرتك الذاتية أثناء حفظ التحديث. أعد تحميلها ثم حاول مجددًا.",
  "review.confirm.error.expired": "انتهت صلاحية هذا الاستيراد.",
  "review.confirm.error.concurrent":
    "يجري إنشاء هذه السيرة الذاتية بالفعل. انتظر قليلًا ثم تحقق مرة أخرى.",
  "review.confirm.error.unavailable":
    "هذا الإجراء غير متاح مؤقتًا. حاول مرة أخرى لاحقًا.",
  "review.confirm.error.cancelled": "تم إيقاف الطلب.",
  "review.confirm.error.generic": "تعذّر إكمال الإجراء. حاول مرة أخرى لاحقًا.",
  "review.confirm.destructive": "إجراء إتلاف",
  "review.minimum.loading": "جارٍ تحميل مراجعة الاستيراد",
  "review.minimum.eyebrow": "مراجعة السيرة الذاتية",
  "review.minimum.loadingStatus": "جارٍ تحميل معلومات سيرتك الذاتية.",
  "review.minimum.unavailable": "المراجعة غير متاحة",
  "review.minimum.title": "راجع المعلومات التي يطلب منك Nuvitae تأكيدها",
  "review.minimum.sourceNote":
    "أنت تراجع مسودة منظمة. يظل الملف الذي رفعته دون تغيير.",
  "review.error.stale": "تغيّرت مراجعتك. أعدنا تحميل أحدث المعلومات.",
  "review.minimum.loaded": "اكتملت مراجعة الاستيراد.",
  "review.update.saving": "جارٍ حفظ المراجعة…",
  "review.update.saved": "تم حفظ التغييرات.",
  "review.update.linkedWarningFailed":
    "تم حفظ تأكيدك، لكن لا يزال هناك عنصر مراجعة مرتبط يحتاج إلى انتباهك.",
  "review.update.error.heading": "تعذّر حفظ التغيير",
  "review.update.error.authentication":
    "سجّل الدخول لمتابعة مراجعة هذا الاستيراد.",
  "review.update.error.notFound":
    "هذا الاستيراد غير متاح أو لم يعد الوصول إليه ممكنًا.",
  "review.update.error.notReady": "هذا الاستيراد غير جاهز للمراجعة بعد.",
  "review.update.error.expired": "انتهت صلاحية هذا الاستيراد.",
  "review.update.error.rateLimited":
    "تم إرسال تغييرات كثيرة. انتظر ثم حاول مجددًا.",
  "review.update.error.unavailable":
    "المراجعة غير متاحة مؤقتًا. حاول مجددًا لاحقًا.",
  "review.update.error.malformed":
    "تعذّرت قراءة استجابة المراجعة بأمان. حاول مجددًا لاحقًا.",
  "review.update.error.cancelled": "تم إيقاف طلب المراجعة.",
  "review.update.error.generic":
    "تعذّر إكمال طلب المراجعة. حاول مجددًا لاحقًا.",
  "review.finalized.openResume": "افتح سيرتي الذاتية",
  "review.finalized.newImport": "ابدأ استيرادًا جديدًا",
  "review.finalized.manual": "تابع يدويًا",
};

const zhCN: Messages = {
  "import.processing.eyebrow": "导入状态",
  "import.processing.problem": "出现问题",
  "import.processing.loading.experience": "正在快速检查您的工作经历…",
  "import.processing.loading.bullets": "正在整理您的项目符号…",
  "import.processing.loading.surprises": "正在检查文档中是否有意外情况…",
  "import.processing.loading.dates": "正在查找可能穿越时空的日期…",
  "import.processing.loading.sections": "正在逐节理顺文档…",
  "import.processing.loading.polishing": "正在润色细节，不会编造晋升经历…",
  "import.processing.longWait": "处理时间稍长。我们会继续显示最新的处理步骤。",
  "import.processing.draftFields": "草稿字段",
  "import.processing.needsAttention": "需要关注",
  "import.processing.review": "审核导入的简历",
  "import.processing.openReview": "打开审核页面",
  "import.processing.replacementNotice":
    "如果您上传其他文件，此前的导入不会在此删除，仍遵循原定的保留期限。",
  "import.processing.replaceUpload": "上传其他文件",
  "import.processing.heading.processing": "正在准备您的简历以供审核",
  "import.processing.heading.draft_ready": "您的简历草稿已准备好",
  "import.processing.heading.partial_extraction":
    "您的简历草稿已准备好，并附有备注",
  "import.processing.heading.recoverable_timeout": "处理时间超出预期",
  "import.processing.heading.validation_failure": "无法导入此文件",
  "import.processing.heading.terminal_processing_failure": "无法准备此简历",
  "import.processing.heading.authentication_required": "需要登录",
  "import.processing.heading.connectivity_lost": "连接暂时中断",
  "import.processing.heading.not_found": "导入不可用",
  "import.processing.heading.expired": "导入已过期",
  "import.processing.heading.cancelled": "导入已停止",
  "import.sourceDeletion.heading": "已上传的源文件",
  "import.sourceDeletion.summary":
    "您上传的文件是临时文件，与结构化简历分开保存。删除该文件会保留这份简历及所有修改。",
  "import.sourceDeletion.action": "删除已上传的源文件",
  "import.sourceDeletion.dialogTitle": "删除已上传的源文件？",
  "import.sourceDeletion.dialogDescription":
    "这将永久删除已上传的文件及仅与源文件有关的内容，不会删除结构化简历或您的修改。",
  "import.sourceDeletion.confirm": "仅删除源文件",
  "import.sourceDeletion.pending": "正在删除源文件",
  "import.sourceDeletion.destructiveMarker": "破坏性操作",
  "import.sourceDeletion.cancel": "保留源文件",
  "import.sourceDeletion.error": "无法删除已上传的源文件，请稍后重试。",
  "shell.home": "首页",
  "shell.resumes": "我的简历",
  "shell.import": "导入简历",
  "shell.create": "创建简历",
  "shell.skip": "跳转到正文",
  "shell.brand": "Nuvitae 首页",
  "shell.navigation": "主导航",
  "shell.language": "应用语言",
  "shell.changed": "应用语言已更改。您的简历内容保持不变。",
  "home.eyebrow": "您的下一个机会从这里开始",
  "home.title": "制作一份让您自信投递的简历。",
  "home.lede": "导入现有简历或从头开始。导出前，每个细节都由您掌控。",
  "home.signIn": "从页面顶部登录，即可保存并随时查看您的简历。",
  "home.choices": "选择开始方式",
  "home.recommended": "推荐",
  "home.importTitle": "导入现有简历",
  "home.importDescription":
    "以现有简历为起点。检查提取的信息，进行修改，然后选择版式。",
  "home.importAction": "导入简历",
  "home.fresh": "从头开始",
  "home.createTitle": "从零创建简历",
  "home.createDescription": "通过引导式编辑器逐项添加您的经历，并实时预览。",
  "home.createAction": "创建简历",
  "home.path": "从初稿到成稿，每一步都清晰明了",
  "home.details": "添加个人信息",
  "home.review": "检查与完善",
  "home.export": "预览与导出",
  "home.privacy": "您的简历仅在您的工作区内私密保存。您可以自行决定何时下载。",
  "import.entry.eyebrow": "推荐",
  "import.entry.title": "从现有简历开始",
  "import.entry.description":
    "上传 PDF 或 DOCX 简历，Nuvitae 会准备一份草稿供您审核，然后再创建结构化简历。",
  "import.entry.choices": "简历创建方式",
  "import.entry.recommendedPath": "推荐方式",
  "import.entry.importTitle": "导入简历",
  "import.entry.importDescription":
    "适合已有简历的您。您始终掌控内容，并在使用前审核导入的信息。",
  "import.entry.importAction": "导入我的简历",
  "import.entry.manualTitle": "手动填写",
  "import.entry.manualDescription":
    "如果您想从空白简历开始并自行填写每个部分，请选择此方式。",
  "import.entry.manualAction": "手动填写",
  "import.upload.eyebrow": "导入简历",
  "import.upload.title": "选择要导入的简历文件",
  "import.upload.description":
    "您的文件仅用于准备草稿。保存为简历前，您会审核每个细节。",
  "import.upload.guidanceTitle": "上传前请确认",
  "import.upload.files": "仅支持 PDF 和 DOCX 文件。",
  "import.upload.languages": "支持法语、英语或法英双语简历。",
  "import.upload.size": "文件大小上限为 10 MB。",
  "import.upload.pages": "最多 5 页。",
  "import.upload.selectableText": "文字必须可选择，不能是扫描件或照片。",
  "import.upload.retention": "上传的文件和临时工作副本将在七天内删除。",
  "import.upload.errorTitle": "无法上传文件",
  "import.upload.fileLabel": "简历文件",
  "import.upload.dropTitle": "将简历拖放到这里",
  "import.upload.dropHint": "或从设备中选择 PDF 或 DOCX 文件",
  "import.upload.noFile": "尚未选择文件。",
  "import.upload.selectedFile": "已选文件：",
  "import.upload.back": "返回",
  "import.upload.submit": "上传并开始导入",
  "import.upload.uploading": "正在上传…",
  "import.upload.error.unsupportedExtension":
    "请选择 PDF 或 DOCX 格式的简历文件。",
  "import.upload.error.emptyFile": "请选择非空的简历文件。",
  "import.upload.error.tooLarge": "请选择不超过 10 MB 的简历文件。",
  "import.upload.error.required": "开始导入前请选择简历文件。",
  "import.provider.title": "Codex 如何帮助您导入简历",
  "import.provider.connection": "需连接 Codex 才能进行最完整的导入。",
  "import.provider.access":
    "Codex 只接收您简历中的文本，无法访问 Nuvitae 中的其他内容。",
  "import.provider.review": "在您审核前，任何内容都不会保存到简历中。",
  "import.provider.verification":
    "Nuvitae 会根据您的文档检查建议，并排除无法验证的信息。",
  "import.provider.fallback":
    "如果 Codex 暂时不可用，您可以使用可能遗漏信息的有限导入，或手动填写详细信息。",
  "import.status.uploadAccepted": "您的文件已接受导入。",
  "import.status.validationStarted": "Nuvitae 正在检查您的文档能否导入。",
  "import.status.processingStarted": "Nuvitae 正在准备您的简历以供审核。",
  "import.status.processingProgress": "Nuvitae 仍在准备您的简历以供审核。",
  "import.processingStep.checkingDocument": "正在检查文档",
  "import.processingStep.readingContent": "正在读取内容",
  "import.processingStep.organizingResumeSections": "正在整理简历部分",
  "import.processingStep.preparingReview": "正在准备审核",
  "import.processingStep.current": "当前步骤：",
  "import.status.providerConnectionRequired":
    "需要连接 AI 提供商才能分析您的简历。",
  "import.status.providerUnavailable":
    "AI 提供商暂时不可用。您可以重试或继续进行受限提取。",
  "import.status.limitedExtractionStarted":
    "受限自动提取已开始，可能会遗漏信息。",
  "import.status.partialDraftReady": "部分草稿已可供审核，可能会缺少一些信息。",
  "import.status.reviewReady": "您的简历草稿已可供审核。",
  "import.status.processingFailed":
    "无法准备您的简历以供审核。您可以重试或手动输入信息。",
  "import.status.retryStarted": "Nuvitae 正在再次尝试准备您的简历。",
  "import.status.cancellationCompleted": "导入已取消。",
  "import.status.sourceDeletionCompleted": "已删除上传的源文件。",
  "import.status.unknown": "导入状态已更改。",
  "metadata.description": "使用 Nuvitae Community 创建和完善您的简历",
  "review.warning.unsafe.title": "未纳入的信息",
  "review.warning.missing.title": "要添加或排除的信息",
  "review.warning.ambiguous.title": "请选择如何使用此信息",
  "review.warning.default.title": "需要快速审核",
  "review.warning.unsafe.message":
    "Nuvitae 无法安全使用您简历中的部分信息，因此已将其排除；如果您希望纳入，可以自行添加。",
  "review.warning.missing.message":
    "此信息未自动添加。您可以添加，或暂时排除。",
  "review.warning.message.ambiguous":
    "此信息可能有多种含义。请检查并选择要在简历中使用的内容。",
  "review.warning.message.conflicting":
    "部分信息不一致。请先检查，再决定保留哪些内容。",
  "review.warning.message.duplicate": "此信息可能已出现在简历的其他位置。",
  "review.warning.message.lowConfidence":
    "无法确信地识别此信息。使用前请检查。",
  "review.warning.message.inferred":
    "此建议是根据您的简历推断得出的。使用前请确认。",
  "review.warning.message.mixedContent":
    "此部分包含不同类型的信息，需要您审核。",
  "review.warning.message.expiredSource":
    "临时源文件已不可用。您仍可审核此处显示的信息。",
  "review.warning.message.default": "继续前需要审核此信息。",
  "review.warning.context": "这与本部分导入的信息有关。",
  "review.warning.state": "此项目状态：",
  "review.warning.status.needsReview": "等待您审核",
  "review.warning.status.confirmed": "已确认",
  "review.warning.status.edited": "已编辑",
  "review.warning.status.excluded": "已排除",
  "review.warning.status.intentionallyLeft": "暂时排除",
  "review.warning.leaveOut": "暂时排除",
  "review.warning.confirm": "确认",
  "review.warning.edit": "编辑信息",
  "review.warning.exclude": "排除",
  "review.provenance.inferred": "在您的简历中找到 — 需要您确认",
  "review.provenance.pdf": "简历页面：",
  "review.provenance.docxBody": "导入自文档正文",
  "review.provenance.docxPart": "导入自文档部分",
  "review.provenance.added": "由您添加",
  "review.provenance.edited": "由您编辑",
  "review.provenance.editedPdf": "由您编辑；最初导入自简历页面：",
  "review.provenance.initial": "导入自初始简历",
  "review.provenance.found": "在您的简历中找到",
  "review.confirm.title.ready": "审核已完成",
  "review.confirm.title.remaining": "完成审核",
  "review.confirm.status.creating": "正在创建您的简历。",
  "review.confirm.status.ready": "您的简历已准备好。",
  "review.confirm.status.discarding": "正在安排清理源文件。",
  "review.confirm.error.heading": "无法完成此操作",
  "review.confirm.ready.description":
    "所有审核细节均已完成。继续使用您保留和修改的信息创建可编辑简历。",
  "review.confirm.create": "创建我的简历",
  "review.confirm.creating": "正在创建您的简历…",
  "review.confirm.remaining.heading": "审核剩余信息",
  "review.confirm.remaining.one": "还有 1 项需要您处理。",
  "review.confirm.remaining.many": "项仍需要您处理。",
  "review.confirm.remaining.instruction": "创建简历前请先审核这些项目。",
  "review.confirm.discard": "放弃导入",
  "review.confirm.dialog.description":
    "Nuvitae 将放弃这份未确认的草稿，并安排清理源文件。删除不会立即完成，此操作也不会删除已确认的简历。",
  "review.confirm.working": "处理中",
  "review.confirm.cancel": "取消",
  "review.confirm.discarded": "已放弃导入，并已安排清理源文件。",
  "review.confirm.error.authentication": "无法验证您的会话。请重新登录后重试。",
  "review.confirm.error.notFound": "此导入已不可用。",
  "review.confirm.error.notReady": "此导入尚未准备好创建简历。",
  "review.confirm.error.unresolved": "创建简历前，请先审核剩余信息。",
  "review.confirm.error.noConfirmedField": "创建简历前，请至少确认一项信息。",
  "review.confirm.error.content":
    "部分已审核信息无法用于创建简历。请检查后重试。",
  "review.confirm.error.staleUpdate":
    "保存更新时您的简历已更改。请重新加载后重试。",
  "review.confirm.error.expired": "此导入已过期。",
  "review.confirm.error.concurrent": "此简历正在创建中。请稍候再检查。",
  "review.confirm.error.unavailable": "此操作暂时不可用，请稍后重试。",
  "review.confirm.error.cancelled": "请求已停止。",
  "review.confirm.error.generic": "无法完成此操作，请稍后重试。",
  "review.confirm.destructive": "破坏性操作",
  "review.minimum.loading": "正在加载导入审核",
  "review.minimum.eyebrow": "简历审核",
  "review.minimum.loadingStatus": "正在加载您的简历信息。",
  "review.minimum.unavailable": "审核不可用",
  "review.minimum.title": "检查 Nuvitae 需要您确认的信息",
  "review.minimum.sourceNote": "您正在审核结构化草稿。您上传的文件保持不变。",
  "review.error.stale": "您的审核已更改。我们已重新加载最新信息。",
  "review.minimum.loaded": "审核已加载。",
  "review.update.saving": "正在保存审核…",
  "review.update.saved": "更改已保存。",
  "review.update.linkedWarningFailed":
    "您的确认已保存，但仍有一个相关审核项目需要处理。",
  "review.update.error.heading": "无法保存此更改",
  "review.update.error.authentication": "请登录后继续审核此导入内容。",
  "review.update.error.notFound": "此导入内容不可用或已无法访问。",
  "review.update.error.notReady": "此导入内容尚未准备好审核。",
  "review.update.error.expired": "此导入内容已过期。",
  "review.update.error.rateLimited": "审核操作过多，请稍候再试。",
  "review.update.error.unavailable": "审核暂时不可用，请稍后重试。",
  "review.update.error.malformed": "无法安全读取审核响应，请稍后重试。",
  "review.update.error.cancelled": "审核请求已停止。",
  "review.update.error.generic": "无法完成审核请求，请稍后重试。",
  "review.finalized.openResume": "打开我的简历",
  "review.finalized.newImport": "开始新的导入",
  "review.finalized.manual": "继续手动填写",
};

export const catalogs: Record<AppLocale, Messages> = {
  en,
  fr,
  es,
  ar,
  "zh-CN": zhCN,
};
export const localeNames: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  "zh-CN": "简体中文",
};
