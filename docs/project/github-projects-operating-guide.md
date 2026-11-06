# Nuvitae — GitHub Projects operating guide

Project Reset, étape 3/4. Classification appliquée le 6 novembre 2026, configuration Projects V2 **validée par l'exécution du propriétaire communiquée le 7 novembre 2026**.

Ce guide décrit la classification réellement appliquée aux issues et PR et les quatre vues actives du [Project Nuvitae Roadmap #2](https://github.com/users/sangimed/projects/2). L'application GitHub connectée ne permet pas de lire les vues Projects V2, mais la sortie fournie par le propriétaire du script `sync-github-project.ps1 -ProjectNumber 2 -Apply` confirme la lecture finale des quatre vues et des cartes.

Références : [roadmap produit](product-roadmap.md), [état de référence](status-baseline-2026-11-06.md) et [checklist Community](../release/community-alpha-readiness.md).

## Automatiser la création et la synchronisation des vues

GitHub GraphQL expose désormais les mutations `createProjectV2View` et
`updateProjectV2View`. Le connecteur GitHub de cette conversation ne donne
pas accès à ces mutations, mais **GitHub CLI peut les appeler avec
`gh api graphql`**. Le script du dépôt effectue cette opération dans le
Project existant, sans en créer d'autre :

```powershell
# Prérequis : GitHub CLI authentifié, avec accès aux Projects.
gh auth status
gh auth refresh -s project

# Depuis la racine du dépôt Nuvitae :
.\scripts\sync-github-project.ps1           # Prévisualisation sans écriture
.\scripts\sync-github-project.ps1 -Apply    # Appliquer et vérifier
```

Si plusieurs Projects contenant « Nuvitae » existent sous `sangimed`,
le script s'arrête au lieu d'en choisir un arbitrairement. Il faut alors
indiquer explicitement son numéro, par exemple
`-Owner sangimed -ProjectNumber 2 -Apply` (le numéro `2` est illustratif).
Le script accepte `-SkipItems` pour ne traiter que les vues.

Il crée ou actualise les quatre vues par **nom, disposition et filtre**,
ajoute les issues ouvertes `roadmap` et les PR ouvertes
`release:community-alpha` seulement lorsqu'elles manquent, puis vérifie
le résultat par relecture. Une seconde exécution n'ajoute pas de doublons.

**Limite confirmée :** l'API GraphQL utilisée permet les dispositions, filtres
et champs visibles, mais pas l'ensemble des réglages de présentation
(groupement/sort par colonnes). Le Board « Current Cycle » peut demander une
vérification finale de son regroupement par le champ Status dans l'interface.

**Statut de cette automatisation :** exécutée avec les permissions Projects du propriétaire et vérifiée dans la sortie de la commande `-Apply` ; les quatre vues et 25 cartes attendues sont présentes. Le regroupement visuel du Kanban et l'état effectif du workflow d'auto-ajout restent des points d'entretien facultatifs à vérifier dans l'interface. Cette procédure n'est pas un workflow GitHub Actions automatiquement déclenché.

## Modifications réellement appliquées

- Les 17 issues ouvertes portent `roadmap` et exactement un des labels `horizon:now`, `horizon:next` ou `horizon:later`.
- Les huit PR alpha #152 et #159 à #165 portent `release:community-alpha`.
- Les PR #133 et #157 portent `queue:dependency-updates`.
- La PR #130 porte `record:historical`.
- Les issues #61, #158, #118, #126 et les PR #130, #133, #157 portent `needs:decision`.
- Un commentaire de cadrage a été publié sur #61.
- Aucun statut, contenu, historique, merge, donnée ou ressource Docker n'a été modifié ou supprimé.

## Horizon NOW

- [#61](https://github.com/sangimed/nuvitae/issues/61) : **seul objectif produit NOW**, conclure la qualification alpha par READY ou NOT READY documenté.
- [#158](https://github.com/sangimed/nuvitae/issues/158) : support de qualification, phase A déterministe validée sur un candidat combiné, disposition humaine encore nécessaire.
- [#118](https://github.com/sangimed/nuvitae/issues/118) : décision de sécurité, requalifier l'ancien blocage CodeQL depuis le passage du dépôt en public.
- [#126](https://github.com/sangimed/nuvitae/issues/126) : décision de sécurité, vérifier la voie de signalement privé de vulnérabilités.

Quatre issues NOW ne sont pas quatre développements parallèles : #158, #118 et #126 servent le seul objectif #61.

## Horizon NEXT

- [#26](https://github.com/sangimed/nuvitae/issues/26) : une amélioration UX issue d'observations réelles, pas de refonte générale sans preuve.
- [#43](https://github.com/sangimed/nuvitae/issues/43) : tester la proposition de valeur.
- [#42](https://github.com/sangimed/nuvitae/issues/42) : mesurer usages et coûts IA avant de fixer un modèle commercial.
- [#28](https://github.com/sangimed/nuvitae/issues/28) : compléter en priorité la documentation révélée nécessaire par les essais.

## Horizon LATER

- [#156](https://github.com/sangimed/nuvitae/issues/156) : expérimentation bornée du workflow agentique.
- [#127](https://github.com/sangimed/nuvitae/issues/127) : SBOM et provenance lors d'une publication effective d'images.
- [#77](https://github.com/sangimed/nuvitae/issues/77) et [#78](https://github.com/sangimed/nuvitae/issues/78) : architecture de sécurité et d'identité Hosted.
- [#41](https://github.com/sangimed/nuvitae/issues/41) : cadre juridique à clarifier avant les premiers revenus.
- [#39](https://github.com/sangimed/nuvitae/issues/39) : EventStorming si une ambiguïté du domaine le justifie.
- [#30](https://github.com/sangimed/nuvitae/issues/30) et [#31](https://github.com/sangimed/nuvitae/issues/31) : langues des CV et langue de l'interface, sujets distincts.
- [#24](https://github.com/sangimed/nuvitae/issues/24) : POC de supervision motivé par les besoins opérationnels.

## Vue Cockpit

- Disposition proposée : Table.
- Filtre Projects : `repo:sangimed/nuvitae is:issue is:open label:roadmap`.
- Champs utiles : titre, statut Projects existant, responsable, labels et PR associées si disponibles.
- Pour isoler les arbitrages : `is:open label:"needs:decision"`.
- Ne pas mettre toutes les issues NOW en cours : une priorité principale reste #61.

## Vue Current Cycle

- Disposition proposée : Board, avec les colonnes de statut Projects déjà existantes.
- Filtre Projects : `repo:sangimed/nuvitae is:issue is:open label:"horizon:now"`.
- Limite de travail : #61 comme initiative principale ; au plus deux flux techniques indépendants si nécessaire.
- Un test PASS sur une branche ou une PR ouverte n'est pas un ticket Done ni un verdict de release.

## Vue Release Readiness

- Disposition proposée : Table.
- Filtre actif : `repo:sangimed/nuvitae is:open label:"horizon:now","release:community-alpha"`.
- Les huit PR avec le label `release:community-alpha` figurent dans les 25 cartes vérifiées du Project (résultat de la synchronisation exécutée par le propriétaire).
- Le workflow auto-add historique basé sur `is:issue` n'ajoute pas les PR.
- Suivre les phases A, B, C, D et E, le candidat Git exact, l'intégration, les risques et le verdict.
- Le succès de la phase A sur `0ee8780` ne constitue pas READY pour Community.

## Vue Backlog / Later

- Disposition proposée : Table.
- Filtre Projects : `repo:sangimed/nuvitae is:issue is:open label:"horizon:next","horizon:later"`.
- Les valeurs multiples d'un même champ sont combinées en OU ; les champs différents sont combinés en ET.
- Faire passer une issue en NOW seulement avec un résultat attendu, un déclencheur et un arbitrage explicite.

## Preuve de validation du Project — étape 3 terminée

Le propriétaire a exécuté en PowerShell la version corrigée du script et a communiqué les résultats suivants :

- Project : [Nuvitae Roadmap #2](https://github.com/users/sangimed/projects/2) ; mode `APPLY`.
- **17 issues roadmap + 8 PR alpha = 25 cartes** ; `Cartes absentes du Project : 0 / 25`.
- **Cockpit** : `TABLE_LAYOUT` ; filtre `repo:sangimed/nuvitae is:issue is:open label:roadmap`.
- **Current Cycle** : `BOARD_LAYOUT` ; filtre `repo:sangimed/nuvitae is:issue is:open label:horizon:now`.
- **Release Readiness** : `TABLE_LAYOUT` ; filtre `repo:sangimed/nuvitae is:open label:horizon:now,release:community-alpha`.
- **Backlog / Later** : `TABLE_LAYOUT` ; filtre `repo:sangimed/nuvitae is:issue is:open label:horizon:next,horizon:later`.
- Les quatre vues sont marquées `VERIFIE`, puis `SUCCES : les 4 vues et les cartes cibles sont verifiees` par le script.

Les filtres affichés ci-dessus sont ceux **retournés par GitHub et normalisés**, et non des descriptions approximatives. Ces preuves permettent de **clôturer l'étape 3/4 du Project Reset** sur son périmètre : organisation des issues et PR, quatre vues filtrées et présence des cartes.

### Maintenance et réserves non bloquantes

- [ ] Vérifier visuellement le **regroupement des colonnes par Status** dans Current Cycle : l'API ne configure pas intégralement cette présentation.
- [ ] Vérifier l'état du workflow **auto-add** historique : la synchronisation manuelle des 25 cartes est démontrée, mais l'activation future du workflow n'est pas prouvée.
- [ ] Examiner l'organisation des colonnes et l'affichage en conditions réelles si un problème d'ergonomie apparaît.

Aucun nouveau Project, merge de PR alpha, changement de statut produit ni appel fournisseur réel n'a été déclenché par cette synchronisation.

## Règles de maintenance

- Toute issue appartenant à la roadmap reçoit `roadmap` et exactement un label d'horizon.
- Les labels expriment la priorité temporelle ; le champ Status exprime l'exécution. Ne pas les confondre.
- La roadmap décrit les objectifs, les issues précisent les critères, #61 et sa checklist gouvernent la release.
- Ne pas ajouter de nouvelle grosse initiative NOW sans justifier le déplacement de la précédente.
- Conserver les PR, branches, historiques et éléments non conclus. Ne jamais déclencher une action destructive ou un appel fournisseur réel à partir d'une simple opération de triage.

## Documentation GitHub

- [Mutations de vues dans l'API GraphQL](https://docs.github.com/en/graphql/reference/projects)
- [Commandes GitHub CLI Projects](https://cli.github.com/manual/gh_project)
- [Filtrage des Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects)
- [Gestion et sauvegarde des vues](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/managing-your-views)
- [Ajout automatique d'éléments](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)
