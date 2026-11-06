# Nuvitae — Roadmap produit Now / Next / Later

> **Project Reset — étape 2/4.** Roadmap initiale établie le 6 novembre 2026.
>
> **Source :** [état de référence daté](status-baseline-2026-11-06.md).
>
> Ce document définit une direction produit et des critères de réussite, pas des
> dates de livraison ni une autorisation de fusion, de déploiement, de suppression
> de données ou d'appel à un véritable fournisseur IA. Le statut effectif d'une
> release reste déterminé par ses preuves et par la
> [checklist Community](../release/community-alpha-readiness.md).

## Cap produit

Nuvitae aide une personne à importer ou créer un CV, contrôler les informations
issues de l'IA, modifier son contenu avec un aperçu visible, le sauvegarder,
puis exporter un PDF lisible et conscient des contraintes ATS.

**Community** est une édition auto-hébergée pour un propriétaire, avec une
installation Docker qui reste technique. Une offre hébergée, sans installation
pour l'utilisateur, est une **hypothèse de produit futur**, pas une capacité
livrée. Ne pas confondre la facilité d'installation de Community avec la
simplicité d'utilisation de l'éditeur.

## Règles de pilotage

- **Une priorité produit principale en NOW.** Les autres actions actives
  servent cette priorité ou répondent à un risque bloquant.
- **Horizons, pas échéances inventées.** Le passage d'un horizon à l'autre
  dépend des preuves définies ci-dessous, et non d'une date arbitraire.
- **Résultats, pas activité.** Une issue fermée, une PR ouverte, une CI verte
  ou des milliers de tests ne prouvent pas, isolément, la valeur utilisateur.
- **Traçabilité.** Séparer le code implémenté, le code intégré à `main`,
  le résultat du gate sur un candidat identifié et l'autorisation de release.
- **Sécurité transversale.** Vie privée, autorisations, isolation des données,
  sécurité des uploads et rigueur des preuves ne sont pas des tickets facultatifs.
- **Décisions explicites.** Les agents fournissent analyses et preuves ; les
  décisions de fusion, de périmètre, de fournisseur réel et de release restent
  du ressort du fondateur.
- **Pas de seconde source d'autorité.** Cette roadmap décrit le _pourquoi_ et
  le _quoi_. Les issues et PR suivent l'exécution ; #61 et sa checklist font
  autorité sur le gate Community. L'étape 3 organise les vues GitHub Projects.

## NOW — Qualifier et rendre livrable la première alpha Community

**Question à résoudre :** une version Community installée proprement permet-elle
de suivre un parcours CV réel, privé, réouvrable et exportable, avec des
contrôles de sécurité satisfaisants ?

**Résultat attendu :** décision **READY** ou **NOT READY** justifiée pour un
candidat effectivement distribuable. L'objectif n'est pas de rendre un voyant
vert en contournant les assertions.

### Point de départ vérifié

Le gate déterministe a passé le 29 octobre 2026 sur le candidat combiné
`0ee8780dfe10fc60fb221297971142747ac2fe2e`. Il couvre notamment 1 911
tests applicatifs, 55 tests de persistance, quatre tests de parseur et 26
contrôles navigateur. Il n'a employé ni connexion ni fournisseur IA réel.

Les huit PR correspondantes, #152 et #159 à #165, étaient encore ouvertes au
6 novembre. Le résultat de ce candidat **ne prouve pas** que le `main` final
est qualifié, ni que la release est READY.

[Preuves de la phase A](https://github.com/sangimed/nuvitae/issues/61#issuecomment-6508922525).

### Jalons et critères de sortie

1. **Intégration contrôlée.** Examiner le lot de PR #152 et #159–#165,
   décider du traitement et vérifier l'arbre réellement intégré et les
   contrôles nécessaires sur le candidat final. Aucune fusion implicite.
2. **Installation propre (phase B).** Prouver le premier démarrage,
   l'état sain des services, le redémarrage et la conservation des données
   dans un projet Docker isolé et préalablement vérifié.
3. **Accès propriétaire (phase C).** Vérifier le comportement anonyme,
   l'authentification réelle, la persistance et la révocation de session,
   les restrictions d'accès et les headers attendus.
4. **Parcours IA réel borné (phase D).** Seulement après autorisation humaine :
   utiliser un CV non sensible approuvé, au maximum une autorisation Codex,
   un import/analyse et une proposition IA. Vérifier import, review,
   correction, confirmation, édition, aperçu, sauvegarde, réouverture,
   export PDF et suppression de la source, conformément à la checklist.
5. **Preuves finales (phase E).** Vérifier les contrôles qualité, sécurité,
   privacy/ownership, réponses navigateur, accessibilité et documentation
   qui s'appliquent réellement à Community. Distinguer les exigences
   réservées à Hosted sans alléger arbitrairement Community.
6. **Décision documentée.** READY uniquement si l'ensemble du gate requis
   est démontré sur le candidat de distribution ; sinon NOT READY avec
   bloqueurs factuels et actions identifiées.

**Issues directrices :** [#61](https://github.com/sangimed/nuvitae/issues/61)
(parent de release) et [#158](https://github.com/sangimed/nuvitae/issues/158)
(phase A techniquement passée, à disposer formellement).

**Points d'administration à requalifier :**
[#118](https://github.com/sangimed/nuvitae/issues/118) (CodeQL, car le dépôt
est désormais public et un job CodeQL a réussi sur la PR #165) et
[#126](https://github.com/sangimed/nuvitae/issues/126) (signalement privé de
vulnérabilités). Leur caractère bloquant doit être décidé à partir des
critères et preuves applicables.

**Hors périmètre de NOW :** refonte visuelle complète, facturation, sécurité
multi-tenant Hosted, internationalisation étendue, nouvelle orchestration
d'agents et fonctionnalités sans lien démontré avec le gate.

## NEXT — Valider l'usage et les premières hypothèses de valeur

**Déclencheur :** un build Community autorisé à des essais utilisateur,
sans contourner les conditions de sécurité et de confidentialité.

**Question à résoudre :** des personnes qui n'ont pas développé Nuvitae
peuvent-elles obtenir un CV utile, et quelles frictions empêchent ce résultat ?

### Deux expériences à évaluer séparément

- **Expérience opérateur Community :** une personne connaissant Git/Docker
  suit les instructions, installe sur une machine propre, se connecte,
  redémarre les services et retrouve ses données.
- **Expérience utilisateur de l'éditeur :** une personne non technique utilise
  une instance déjà disponible, importe ou crée un CV, contrôle les faits,
  modifie le document et réalise un export exploitable.

### Hypothèses et mesures proposées

Ces cibles sont des **objectifs d'étude**, pas des sessions déjà réalisées :

- Réaliser **3 à 5 sessions d'observation** du parcours CV, et au moins
  **une installation de Community par un opérateur externe au développement**
  si possible.
- Pour chaque tentative, noter sans enregistrer le contenu privé du CV :
  réussite de l'export, besoin d'assistance, étape bloquante, abandon et
  difficulté rencontrée.
- Identifier les **trois frictions les plus graves ou répétées**, en
  séparant défaut réel, complexité de parcours, problème d'explication
  et préférence esthétique.
- Tester la compréhension de la proposition de valeur et les différenciateurs
  présumés, sans prétendre à une supériorité ATS ou IA non démontrée.
- Choisir **une seule tranche de correction UX** à partir des observations,
  puis valider son effet et l'absence de régressions fonctionnelles.

### Travaux rattachés

- [#26](https://github.com/sangimed/nuvitae/issues/26) : epic UX ; prioriser
  un problème démontré, pas une refonte générale avant les tests.
- [#43](https://github.com/sangimed/nuvitae/issues/43) : positionnement et
  proposition de valeur à confronter aux utilisateurs.
- [#42](https://github.com/sangimed/nuvitae/issues/42) : découvrir les
  usages et mesurer les coûts IA ; ne pas figer le pricing ni coder le billing.
- [#28](https://github.com/sangimed/nuvitae/issues/28) : compléter
  en priorité la documentation révélée manquante par les essais d'installation.

**Condition de sortie de NEXT :** synthèse de recherche anonymisée,
constats classés par gravité et fréquence, hypothèse de valeur clarifiée,
et une prochaine amélioration priorisée avec critère de réussite.

## LATER — Préparer la viabilité commerciale et l'expansion

**Déclencheur :** les premières preuves d'utilité orientent une décision
explicite vers une offre hébergée et un modèle économique.

### Chantiers possibles

- **Économie et offre hébergée :**
  [#42](https://github.com/sangimed/nuvitae/issues/42) (continuité du
  travail de découverte) ; définir coûts réels, fréquence d'usage,
  limites d'IA et offres avant toute facturation.
- **Cadre juridique avant premier revenu :**
  [#41](https://github.com/sangimed/nuvitae/issues/41).
- **Préparation Cloud, seulement avant une production hébergée :**
  [#77](https://github.com/sangimed/nuvitae/issues/77) (infrastructure,
  secrets, données) et
  [#78](https://github.com/sangimed/nuvitae/issues/78) (identité,
  sessions et séparation des utilisateurs).
- **Publication d'artefacts :**
  [#127](https://github.com/sangimed/nuvitae/issues/127) (SBOM et
  provenance), au moment de disposer d'une véritable chaîne de publication.
- **Internationalisation :**
  [#30](https://github.com/sangimed/nuvitae/issues/30) (langues des CV
  importés) et
  [#31](https://github.com/sangimed/nuvitae/issues/31) (langues de
  l'interface), à traiter distinctement.
- **Architecture et opérations :**
  [#39](https://github.com/sangimed/nuvitae/issues/39) si des ambiguïtés
  du domaine justifient un EventStorming ciblé ;
  [#24](https://github.com/sangimed/nuvitae/issues/24) pour un POC
  d'observabilité motivé par des difficultés concrètes.
- **Efficacité des agents :**
  [#156](https://github.com/sangimed/nuvitae/issues/156) pour un
  pilote borné avec mesure du bénéfice avant généralisation.

**Condition de sortie de LATER :** chaque initiative reçoit son propre
objectif, son critère de succès et ses prérequis lorsque son déclencheur
est atteint. Ce document ne promet pas que toutes ces initiatives seront
construites.

## Décisions ouvertes, indépendantes de cette roadmap

- **D1 — Périmètre de l'alpha :** conserver un seul objectif NOW et
  repousser les travaux sans lien direct avec ses bloqueurs.
- **D2 — Intégration :** décider de l'ordre et du contrôle de merge des
  huit PR qualifiées, sans inférer qu'elles sont déjà dans `main`.
- **D3 — Autorisations :** valider explicitement l'environnement pour
  les phases B/C et le budget réel pour la phase D.
- **D4 — Gate sécurité :** préciser et prouver les critères Community
  distincts de la future offre Hosted.
- **D5 — Backlog :** traiter #118, #126, la PR documentaire historique
  #130 et les PR Dependabot #133/#157 selon leur état actuel.
- **D6 — Premiers tests :** définir participants, modalités d'accès
  et précautions de confidentialité avant NEXT.

Ces décisions devront être suivies explicitement ; leur présence dans la
roadmap ne les rend pas approuvées.

## Passage à l'étape 3 du Project Reset

Une fois cette roadmap intégrée dans `main`, l'étape 2 est terminée.
L'étape 3 consiste à faire correspondre GitHub Projects à ce document :
vues Cockpit / Current Cycle / Release Readiness / Backlog, liens entre
objectifs et issues, statuts et blocages, et limite de travail simultané.

Ne pas créer une issue pour chaque ligne de roadmap, ni un deuxième
registre concurrençant les issues existantes. Les décisions de scope,
les champs du board et les fermetures éventuelles de tickets seront
effectués **dans l'étape 3**, pas par ce document.
