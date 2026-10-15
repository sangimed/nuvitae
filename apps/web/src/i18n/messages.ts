export const en = {
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
  "import.status.validationStarted": "Nuvitae is checking that your document can be imported.",
  "import.status.processingStarted": "Nuvitae is preparing your resume for review.",
  "import.status.processingProgress": "Nuvitae is still preparing your resume for review.",
  "import.processingStep.checkingDocument": "checking the document",
  "import.processingStep.readingContent": "reading the content",
  "import.processingStep.organizingResumeSections": "organizing resume sections",
  "import.processingStep.preparingReview": "preparing review",
  "import.processingStep.current": "Current step:",
  "import.status.providerConnectionRequired": "A connected AI provider is needed to analyse your resume.",
  "import.status.providerUnavailable": "The AI provider is temporarily unavailable. You can try again or continue with limited extraction.",
  "import.status.limitedExtractionStarted": "Limited automatic extraction has started. It may miss information.",
  "import.status.partialDraftReady": "A partial draft is ready for review. Some information may be missing.",
  "import.status.reviewReady": "Your resume draft is ready for review.",
  "import.status.processingFailed": "Your resume could not be prepared for review. You can try again or enter the information manually.",
  "import.status.retryStarted": "Nuvitae is trying to prepare your resume again.",
  "import.status.cancellationCompleted": "The import was cancelled.",
  "import.status.sourceDeletionCompleted": "The uploaded source has been removed.",
  "import.status.unknown": "The import status changed.",
  "metadata.description":
    "Create and improve your resume with Nuvitae Community",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const fr: Messages = {
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
  "import.status.uploadAccepted": "Votre fichier a été accepté pour l’importation.",
  "import.status.validationStarted": "Nuvitae vérifie que votre document peut être importé.",
  "import.status.processingStarted": "Nuvitae prépare votre CV pour la vérification.",
  "import.status.processingProgress": "Nuvitae continue de préparer votre CV pour la vérification.",
  "import.processingStep.checkingDocument": "vérification du document",
  "import.processingStep.readingContent": "lecture du contenu",
  "import.processingStep.organizingResumeSections": "organisation des rubriques du CV",
  "import.processingStep.preparingReview": "préparation de la vérification",
  "import.processingStep.current": "Étape en cours :",
  "import.status.providerConnectionRequired": "Un fournisseur d’IA connecté est nécessaire pour analyser votre CV.",
  "import.status.providerUnavailable": "Le fournisseur d’IA est temporairement indisponible. Vous pouvez réessayer ou poursuivre avec une extraction limitée.",
  "import.status.limitedExtractionStarted": "L’extraction automatique limitée a commencé. Des informations peuvent manquer.",
  "import.status.partialDraftReady": "Un brouillon partiel est prêt à être vérifié. Certaines informations peuvent manquer.",
  "import.status.reviewReady": "Votre brouillon de CV est prêt à être vérifié.",
  "import.status.processingFailed": "Votre CV n’a pas pu être préparé pour vérification. Vous pouvez réessayer ou saisir les informations manuellement.",
  "import.status.retryStarted": "Nuvitae réessaie de préparer votre CV.",
  "import.status.cancellationCompleted": "L’importation a été annulée.",
  "import.status.sourceDeletionCompleted": "Le fichier source importé a été supprimé.",
  "import.status.unknown": "L’état de l’importation a changé.",
  "metadata.description": "Créez et améliorez votre CV avec Nuvitae Community",
};

const es: Messages = {
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
  "import.status.validationStarted": "Nuvitae está comprobando que tu documento se puede importar.",
  "import.status.processingStarted": "Nuvitae está preparando tu currículum para revisarlo.",
  "import.status.processingProgress": "Nuvitae sigue preparando tu currículum para revisarlo.",
  "import.processingStep.checkingDocument": "comprobando el documento",
  "import.processingStep.readingContent": "leyendo el contenido",
  "import.processingStep.organizingResumeSections": "organizando las secciones del currículum",
  "import.processingStep.preparingReview": "preparando la revisión",
  "import.processingStep.current": "Paso actual:",
  "import.status.providerConnectionRequired": "Se necesita un proveedor de IA conectado para analizar tu currículum.",
  "import.status.providerUnavailable": "El proveedor de IA no está disponible temporalmente. Puedes volver a intentarlo o continuar con una extracción limitada.",
  "import.status.limitedExtractionStarted": "La extracción automática limitada ha comenzado. Puede que falte información.",
  "import.status.partialDraftReady": "Hay un borrador parcial listo para revisar. Puede que falte información.",
  "import.status.reviewReady": "El borrador de tu currículum está listo para revisar.",
  "import.status.processingFailed": "No se ha podido preparar tu currículum para revisarlo. Puedes volver a intentarlo o introducir la información manualmente.",
  "import.status.retryStarted": "Nuvitae está intentando preparar tu currículum de nuevo.",
  "import.status.cancellationCompleted": "Se ha cancelado la importación.",
  "import.status.sourceDeletionCompleted": "Se ha eliminado el archivo fuente subido.",
  "import.status.unknown": "El estado de la importación ha cambiado.",
  "metadata.description": "Crea y mejora tu currículum con Nuvitae Community",
};

const ar: Messages = {
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
  "import.status.processingProgress": "لا يزال Nuvitae يُعِد سيرتك الذاتية للمراجعة.",
  "import.processingStep.checkingDocument": "جارٍ التحقق من المستند",
  "import.processingStep.readingContent": "جارٍ قراءة المحتوى",
  "import.processingStep.organizingResumeSections": "جارٍ تنظيم أقسام السيرة الذاتية",
  "import.processingStep.preparingReview": "جارٍ إعداد المراجعة",
  "import.processingStep.current": "الخطوة الحالية:",
  "import.status.providerConnectionRequired": "يلزم موفر ذكاء اصطناعي متصل لتحليل سيرتك الذاتية.",
  "import.status.providerUnavailable": "موفر الذكاء الاصطناعي غير متاح مؤقتًا. يمكنك المحاولة مرة أخرى أو المتابعة باستخراج محدود.",
  "import.status.limitedExtractionStarted": "بدأ الاستخراج التلقائي المحدود. قد تفوت بعض المعلومات.",
  "import.status.partialDraftReady": "مسودة جزئية جاهزة للمراجعة. قد تكون بعض المعلومات مفقودة.",
  "import.status.reviewReady": "مسودة سيرتك الذاتية جاهزة للمراجعة.",
  "import.status.processingFailed": "تعذر إعداد سيرتك الذاتية للمراجعة. يمكنك المحاولة مرة أخرى أو إدخال المعلومات يدويًا.",
  "import.status.retryStarted": "يحاول Nuvitae إعداد سيرتك الذاتية مرة أخرى.",
  "import.status.cancellationCompleted": "تم إلغاء الاستيراد.",
  "import.status.sourceDeletionCompleted": "تمت إزالة الملف المصدر الذي تم تحميله.",
  "import.status.unknown": "تغيرت حالة الاستيراد.",
  "metadata.description":
    "أنشئ سيرتك الذاتية وحسّنها باستخدام Nuvitae Community",
};

const zhCN: Messages = {
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
  "import.status.providerConnectionRequired": "需要连接 AI 提供商才能分析您的简历。",
  "import.status.providerUnavailable": "AI 提供商暂时不可用。您可以重试或继续进行受限提取。",
  "import.status.limitedExtractionStarted": "受限自动提取已开始，可能会遗漏信息。",
  "import.status.partialDraftReady": "部分草稿已可供审核，可能会缺少一些信息。",
  "import.status.reviewReady": "您的简历草稿已可供审核。",
  "import.status.processingFailed": "无法准备您的简历以供审核。您可以重试或手动输入信息。",
  "import.status.retryStarted": "Nuvitae 正在再次尝试准备您的简历。",
  "import.status.cancellationCompleted": "导入已取消。",
  "import.status.sourceDeletionCompleted": "已删除上传的源文件。",
  "import.status.unknown": "导入状态已更改。",
  "metadata.description": "使用 Nuvitae Community 创建和完善您的简历",
};

export const catalogs = { en, fr, es, ar, "zh-CN": zhCN };
export type AppLocale = keyof typeof catalogs;
export const localeNames: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  "zh-CN": "简体中文",
};
