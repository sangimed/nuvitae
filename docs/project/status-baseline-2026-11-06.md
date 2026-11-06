# Nuvitae — État de référence du projet (6 novembre 2026)

> **Project Reset — Étape 1/4 : reconstitution de la situation.**
> **Nature :** instantané factuel daté, et non tableau de bord vivant ni autorisation de merge, d'exécution ou de publication.
> **Périmètre :** dépôt GitHub sangimed/nuvitae, issues, PR, preuves publiées et documentation sur la branche principale.
> **Décisions :** toutes les propositions de triage et de priorité ci-dessous restent soumises à arbitrage ; aucune modification des issues/PR produit n'est implicite.

## Résumé exécutif

- Au 6 novembre 2026, la branche principale pointait sur le commit **663bf6a3fc83cb3dcd3bc22ed1cd583ceae907e7**, daté du 19 octobre (travaux de frontière de télémétrie liés à #24).
- **17 issues et 11 pull requests ouvertes** ont été inventoriées. Seulement **3 issues ouvertes** portent le label `roadmap` (#61, #158 et #156). Ceci ne démontre pas à lui seul quelles issues figurent dans GitHub Projects.
- Le **gate déterministe Community alpha a réussi** le 29 octobre 2026 sur le candidat combiné **0ee8780dfe10fc60fb221297971142747ac2fe2e** : sortie exacte 0, 1 911 tests applicatifs, 55 tests de persistance, 4 tests de parseur isolé, 26 contrôles navigateur et audit des dépendances de production sans vulnérabilité connue. [Preuves et matrice détaillée](https://github.com/sangimed/nuvitae/issues/61#issuecomment-6508922525).
- Ce candidat rassemble huit PR **toujours ouvertes et non intégrées à la branche principale** : #152, #159, #160, #161, #162, #163, #164 et #165. Leurs diffs et leurs arbres combinés ont été vérifiés lors de la validation du 29 octobre.
- **Community alpha : NOT READY.** Les phases B (installation fraîche), C (session normale), D (parcours réel avec fournisseur autorisé) et le solde des preuves E (sécurité, UX et qualité) ne sont pas établis par la phase A. Aucun fournisseur réel n'a été appelé pendant le gate déterministe.
- Le dépôt est maintenant **public**. L'issue #118, toujours construite autour du blocage du CodeQL pour un dépôt privé, mérite requalification : le job CodeQL a réussi sur le head de #165, de même que Secret scan. La condition liée à la visibilité privée figure encore dans la configuration de `main`.
- Sur le head de #165, Documentation et Security analysis sont vertes, tandis que Quality gates échoue notamment sur Dependency vulnerabilities et Tests. **Cette PR individuelle ne contient pas les sept autres corrections du candidat combiné**, donc ce résultat ne réfute pas le succès du gate.
- Le dernier compte rendu de release **intégré dans la documentation canonique sur `main`** date du 5 septembre ; les preuves les plus récentes sont dans les commentaires #61/#158. La PR #130 contient un état historique daté du 22 septembre : ne pas le présenter comme verdict actuel.

### Trois états à ne jamais confondre

1. **Implémenté** : code et correctifs existent dans une branche ou une PR.
2. **Intégré** : ce code a effectivement rejoint la branche principale.
3. **Prêt à livrer** : le candidat final a passé tous les critères de release applicables, et non uniquement les tests déterministes.

Le succès du gate du 29 octobre établit le premier état pour le lot combiné, **pas** l'intégration de toutes les PR ni une décision READY.

## Travaux réalisés et travaux restants

- **Parcours CV** — Travaux et preuves : #54, #55, #56, #57, #58, #60 et #40 clôturées ; import/review/édition/preview/PDF et persistance couverts par des tests déterministes ; État factuel : Fondations présentes, non assimilables à une validation utilisateur réelle
- **Contrôles de sécurité** — Travaux et preuves : #75 et #76 clôturées ; contrôles intégrés au gate ; État factuel : Fondations livrées, autres éléments de release à confirmer
- **Corrections alpha** — Travaux et preuves : #152 et #159 à #165 ; État factuel : Qualifiées **ensemble** sur un candidat, non mergées
- **Gate déterministe** — Travaux et preuves : #158 et #61, rapport du 29 octobre ; État factuel : **PASS sur candidat 0ee8780** ; #158 reste ouverte pour disposition humaine
- **Installation + session normales** — Travaux et preuves : Phases B et C de #61 ; État factuel : **NOT RUN** dans les preuves du dernier gate
- **Fournisseur IA réel** — Travaux et preuves : Phase D de #61 ; État factuel : **NOT RUN**, autorisation et budget spécifique requis
- **Contrôles de release complémentaires** — Travaux et preuves : Phase E de #61 ; État factuel : **INCOMPLET**, ne pas inférer PASS depuis la phase A
- **Documentation développeur** — Travaux et preuves : Fondation MkDocs livrée via #104 ; [coverage ledger](../site/coverage.md) ; État factuel : #28 reste un epic partiellement achevé
- **Observabilité** — Travaux et preuves : [Évaluation #24](../observability/issue-24-evaluation.md) et frontière opt-in de télémétrie ; État factuel : Évaluation/contrat technique partiels ; aucune expérience de monitoring déployée démontrée
- **Expérience UI** — Travaux et preuves : Sous-travaux #50, #52, #58, #71 clos ; État factuel : Epic UX #26 toujours partiellement ouvert

## Les 11 PR ouvertes : inventaire et disposition proposée

- **[#152](https://github.com/sangimed/nuvitae/pull/152)** — Changement : Dépendances de production, audit vulnérabilités ; Disposition **proposée**, non effectuée : Lot alpha qualifié ; préparer intégration contrôlée
- **[#159](https://github.com/sangimed/nuvitae/pull/159)** — Changement : Attente d'erreur PDF localisée ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#160](https://github.com/sangimed/nuvitae/pull/160)** — Changement : Fallback explicite sans fournisseur ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#161](https://github.com/sangimed/nuvitae/pull/161)** — Changement : Correctif produit : état queued persisté avant publication du job ; Disposition **proposée**, non effectuée : Lot alpha qualifié ; **véritable correction fonctionnelle**
- **[#162](https://github.com/sangimed/nuvitae/pull/162)** — Changement : Sérialisation de création des bases de test ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#163](https://github.com/sangimed/nuvitae/pull/163)** — Changement : Assertion avertissement DOCX et confirmation ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#164](https://github.com/sangimed/nuvitae/pull/164)** — Changement : Isolation des budgets d'uploads par batch serveur ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#165](https://github.com/sangimed/nuvitae/pull/165)** — Changement : Tests de navigation/review alignés sur l'UX actuelle ; Disposition **proposée**, non effectuée : Lot alpha qualifié
- **[#133](https://github.com/sangimed/nuvitae/pull/133)** — Changement : Dependabot GitHub CodeQL actions ; Disposition **proposée**, non effectuée : Hors lot alpha ; réévaluer après stabilisation CI
- **[#157](https://github.com/sangimed/nuvitae/pull/157)** — Changement : Dependabot dépendances de développement ; Disposition **proposée**, non effectuée : Hors lot alpha ; chevauche #152 sur lockfile et manifests
- **[#130](https://github.com/sangimed/nuvitae/pull/130)** — Changement : Compte rendu de revalidation du 22 septembre ; Disposition **proposée**, non effectuée : Historique daté ; requalifier ou archiver, sans écraser la chronologie

**Précaution :** l'ordre de recomposition démontré (#152, #159, #160, #161, #162, #163, #164, #165) n'est pas la preuve d'une dépendance métier stricte entre chaque PR. Aucune fusion automatique n'est décidée ici.

## Les 17 issues ouvertes : état et orientation proposée

- **[#61](https://github.com/sangimed/nuvitae/issues/61)** — Situation connue : P0, qualification alpha ; non READY ; Orientation **proposée** : **NOW**, objectif parent jusqu'à décision finale
- **[#158](https://github.com/sangimed/nuvitae/issues/158)** — Situation connue : Phase A réussie sur candidat, issue encore ouverte ; Orientation **proposée** : **NOW**, statuer sur sa clôture avec l'intégration
- **[#118](https://github.com/sangimed/nuvitae/issues/118)** — Situation connue : Ancien contexte CodeQL sur dépôt privé ; Orientation **proposée** : **REQUALIFIER**, dépôt public et job CodeQL réussi sur #165
- **[#126](https://github.com/sangimed/nuvitae/issues/126)** — Situation connue : Canal privé de signalement non prouvé ; SECURITY.md absent de main ; Orientation **proposée** : **VÉRIFIER**, avant distribution publique de l'offre
- **[#26](https://github.com/sangimed/nuvitae/issues/26)** — Situation connue : Epic UX ; plusieurs sous-issues déjà closes ; Orientation **proposée** : **NEXT**, redéfinir le restant à partir d'usage réel
- **[#156](https://github.com/sangimed/nuvitae/issues/156)** — Situation connue : Expérience skills Codex/Orca sans preuve de valeur finale ; Orientation **proposée** : **LATER**, pilote borné après release
- **[#28](https://github.com/sangimed/nuvitae/issues/28)** — Situation connue : Fondation MkDocs présente ; lacunes documentées ; Orientation **proposée** : **NEXT**, scinder les lacunes utiles, garder epic
- **[#24](https://github.com/sangimed/nuvitae/issues/24)** — Situation connue : Étude et frontière de télémétrie présentes ; Orientation **proposée** : **NEXT/LATER**, choisir un POC utile plutôt qu'un nouvel APM
- **[#43](https://github.com/sangimed/nuvitae/issues/43)** — Situation connue : Proposition de valeur/landing non validée ; Orientation **proposée** : **NEXT**, découvrir et tester les messages
- **[#42](https://github.com/sangimed/nuvitae/issues/42)** — Situation connue : Économie Community/Hosted non validée ; Orientation **proposée** : **NEXT**, coût unitaire et usages avant facturation
- **[#41](https://github.com/sangimed/nuvitae/issues/41)** — Situation connue : Étude légale CDI/monétisation non conclue ; Orientation **proposée** : **AVANT PREMIER REVENU**, pas un blocage de Community gratuite
- **[#39](https://github.com/sangimed/nuvitae/issues/39)** — Situation connue : EventStorming proposé, sans résultat démontré ; Orientation **proposée** : **LATER**, à activer sur ambiguïté réelle du domaine
- **[#30](https://github.com/sangimed/nuvitae/issues/30)** — Situation connue : Langue des CV importés au-delà FR/EN ; Orientation **proposée** : **LATER**, distinct de la langue UI
- **[#31](https://github.com/sangimed/nuvitae/issues/31)** — Situation connue : Internationalisation de l'interface ; Orientation **proposée** : **LATER**, distinct de #30
- **[#77](https://github.com/sangimed/nuvitae/issues/77)** — Situation connue : Hardening infrastructure hosted ; Orientation **proposée** : **LATER**, prérequis Cloud, pas Community loopback
- **[#78](https://github.com/sangimed/nuvitae/issues/78)** — Situation connue : Identité et sessions hosted multi-utilisateur ; Orientation **proposée** : **LATER**, prérequis Cloud
- **[#127](https://github.com/sangimed/nuvitae/issues/127)** — Situation connue : SBOM/provenance d'images publiées ; Orientation **proposée** : **LATER**, dépend du vrai pipeline de publication

### Chevauchements, doublons et état obsolète

- **#61 et #158 :** relation parent/sous-objectif, pas doublon. Le gate déterministe de #158 est passé ; les autres phases de #61 restent ouvertes.
- **#152 et #157 :** chevauchement concret des manifests et de `pnpm-lock.yaml`; recomposer et retester avant d'intégrer #157.
- **#160 et #163 :** touchent le même test navigateur pour deux corrections distinctes ; la vérification sur le candidat combiné fait foi pour ce périmètre.
- **#130 et compte rendu canonique de release :** historiques utiles mais plus anciens que les conclusions du 29 octobre ; conserver les dates au lieu d'écraser les preuves.
- **#118 et ancienne #103 clôturée :** même historique Code Scanning privé ; vérifier la pertinence résiduelle de #118 plutôt que recréer le sujet.
- **#26 et sous-issues UX clôturées :** epic partiellement réalisé, pas un chantier vierge.
- **#28 et #24 :** travaux partiellement livrés ; ne pas les classer « non commencés ».
- **#30 et #31 :** pas des doublons : langue du contenu importé et langue de l'interface sont des préoccupations différentes.

## Dépendances critiques jusqu'à Community alpha

1. **Candidat existant :** la recomposition des huit PR a produit 0ee8780, validé en phase A.
2. **Intégration :** décider de la stratégie de fusion des huit PR ; vérifier l'arbre exact et la qualité du commit final sur main. Ne pas confondre gate sur candidat et CI de main.
3. **Phase B :** installation Community Docker fraîche dans un projet isolé, reprise et persistance.
4. **Phase C :** accès propriétaire réel, contrôles de session et headers.
5. **Phase D :** parcours fournisseur réel **uniquement après autorisation distincte**, une connexion, un import/analyse et une proposition maximum, sans relance opportuniste.
6. **Phase E :** collecte des preuves sécurité, confidentialité, qualité, accessibilité et documentation applicables à Community.
7. **Décision finale :** READY seulement si les prérequis de la [checklist canonique](../release/community-alpha-readiness.md) sont satisfaits et intégrés ; sinon NOT READY avec blocages précis.

Dépendances hors alpha : #42 et #41 avant la première vente ; #77/#78 avant lancement Cloud ; #127 lors de la publication d'artefacts ; #39 peut nourrir les lacunes documentaires de #28.

## Registre des décisions **en attente**

- **D1** — Priorité : P0 ; Décision à prendre par le fondateur : Gel temporaire des nouveaux grands chantiers ; Recommandation de l'audit : Oui, jusqu'à stabilisation de la trajectoire alpha
- **D2** — Priorité : P0 ; Décision à prendre par le fondateur : Fusion des huit PR du candidat validé ; Recommandation de l'audit : Préparer ordre et garde-fous, contrôler SHA final ; aucune fusion implicite
- **D3** — Priorité : P0 ; Décision à prendre par le fondateur : Exécution des phases B et C ; Recommandation de l'audit : Utiliser environnement isolé, préflight ressources, aucune suppression implicite
- **D4** — Priorité : P0 ; Décision à prendre par le fondateur : Autorisation phase D avec vrai fournisseur ; Recommandation de l'audit : Décision séparée, CV autorisé non sensible, budget strict documenté
- **D5** — Priorité : P0 ; Décision à prendre par le fondateur : Quels contrôles de sécurité sont bloquants pour Community ? ; Recommandation de l'audit : Séparer Community loopback et Hosted ; ne pas lever une exigence sans preuve
- **D6** — Priorité : P1 ; Décision à prendre par le fondateur : Disposition de #118 et #126 ; Recommandation de l'audit : Requalifier à partir de la visibilité actuelle et des contrôles effectivement activés
- **D7** — Priorité : P1 ; Décision à prendre par le fondateur : Disposition de #130 ; Recommandation de l'audit : Archiver ou actualiser sans réécrire les anciens verdicts
- **D8** — Priorité : P1 ; Décision à prendre par le fondateur : Traitement de #133 et #157 ; Recommandation de l'audit : Hors lot alpha ; validation spécifique après intégration
- **D9** — Priorité : P1 ; Décision à prendre par le fondateur : Source d'autorité durable roadmap/status/scorecard ; Recommandation de l'audit : Étapes 2–4 du Project Reset, pas décidée dans cet audit

## Limites et méthode

- Inspection de GitHub et des documents existants. **Aucun re-test Docker**, aucune authentification fournisseur, aucun test sur vrais CV ni intervention sur les environnements locaux.
- Les données quantitatives et les PR ouvertes sont un **instantané du 6 novembre 2026** ; la réussite du gate est une preuve **datée du 29 octobre**, pas un nouveau passage aujourd'hui.
- GitHub Projects, worktrees/branches locales non poussées, bundles, stashes, volumes, credentials et paramètres de protection complets n'ont pas fait l'objet d'un inventaire direct. Ce rapport ne prétend pas couvrir ces surfaces.
- Une issue ouverte n'est pas nécessairement non commencée ; un commit présent dans une PR n'est pas dans main ; une revue favorable ne vaut pas merge ; une CI individuelle rouge ne nie pas automatiquement la qualification d'un candidat combiné.
- Les priorités et dispositions proposées sont **des recommandations**, pas des décisions déjà prises ; elles seront arbitrées pendant les prochaines étapes.

## Références vérifiables

- [Dépôt](https://github.com/sangimed/nuvitae)
- [Phase A — gate PASS du 29/10, matrice détaillée](https://github.com/sangimed/nuvitae/issues/61#issuecomment-6508922525)
- [Issue de gate #158](https://github.com/sangimed/nuvitae/issues/158)
- [Checklist canonique Community](../release/community-alpha-readiness.md)
- [Couverture restante de MkDocs](../site/coverage.md)
- [Workflow sécurité](../../.github/workflows/security-analysis.yml)
- [CI qualité de #165](https://github.com/sangimed/nuvitae/actions/runs/40951757542)
- [CI sécurité de #165](https://github.com/sangimed/nuvitae/actions/runs/40951757708)

---

**Critère de clôture Project Reset — étape 1 :** ce document intégré dans main, avec un audit traçable, des faits distincts des hypothèses, un inventaire complet des issues/PR ouvertes et un registre de décisions non encore exécutées. Les fusions des PR produit, la roadmap et la mise en place du pilotage restent hors périmètre de cette étape.
