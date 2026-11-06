# Nuvitae — GitHub Projects operating guide

> **Project Reset — étape 3/4, configuration partielle vérifiée le 6 novembre 2026.**
>
> Ce fichier décrit l'organisation déjà appliquée aux issues/PR GitHub et la
> configuration souhaitée du **GitHub Project existant**. Il ne prétend pas que
> les vues ou champs Projects V2 sont déjà créés : l'intégration GitHub employée
> pour cette passe n'expose pas leur lecture ni leur mutation.
>
> La stratégie produit reste définie dans
> [product-roadmap.md](product-roadmap.md). Les preuves et le gate de publication
> restent dans la [checklist alpha](../release/community-alpha-readiness.md) et
> [#61](https://github.com/sangimed/nuvitae/issues/61).

## Ce qui a été réellement appliqué

- Les **17 issues ouvertes** de Nuvitae ont le label `roadmap`. L'ancien
  workflow d'ajout automatique est censé filtrer
  `is:issue is:open label:roadmap`, mais sa configuration active et son
  résultat dans le Project n'ont **pas pu être relus directement**.
- Chaque issue ouverte a **exactement un** horizon :
  `horizon:now`, `horizon:next` ou `horizon:later`.
- Les **8 PR** du candidat alpha portent `release:community-alpha` ;
  #133/#157 portent `queue:dependency-updates` et #130
  `record:historical`.
- Les éléments nécessitant un arbitrage immédiat portent
  `needs:decision` : issues #61, #158, #118, #126 et PR #130, #133, #157.
- Aucun état d'issue ou de PR n'a été changé ; aucune branche, PR, worktree,
  donnée Docker ou pièce jointe n'a été supprimée ou fusionnée.

## Correspondance des horizons

### NOW — une seule priorité produit

- [#61](https://github.com/sangimed/nuvitae/issues/61) : **objectif principal**,
  qualifier Community alpha pour un verdict documenté.
- [#158](https://github.com/sangimed/nuvitae/issues/158) : **support du gate**,
  phase A vérifiée sur un candidat combiné ; disposition humaine et vérification
  de l'intégration à `main` encore nécessaires.
- [#118](https://github.com/sangimed/nuvitae/issues/118) : **décision de
  sécurité/administration**, contexte historique à requalifier depuis le passage
  du dépôt en public.
- [#126](https://github.com/sangimed/nuvitae/issues/126) : **décision de
  signalement de vulnérabilités**, niveau de préparation à établir.

**Important :** quatre tickets NOW ne signifient pas quatre chantiers
fonctionnels en parallèle. Les trois derniers soutiennent ou conditionnent
l'objectif #61. La limitation de WIP porte sur les initiatives actives, pas
sur le nombre de décisions à résoudre.

### NEXT — premiers essais utilisateurs et valeur

- [#26](https://github.com/sangimed/nuvitae/issues/26) : tranche UX ciblée
  à choisir après observations, pas refonte générale non justifiée.
- [#43](https://github.com/sangimed/nuvitae/issues/43) : proposition de valeur.
- [#42](https://github.com/sangimed/nuvitae/issues/42) : étude des usages et
  coûts IA, sans facturation prématurée.
- [#28](https://github.com/sangimed/nuvitae/issues/28) : compléter la
  documentation réellement nécessaire aux utilisateurs/opérateurs.

### LATER — expansion et prérequis conditionnels

- [#156](https://github.com/sangimed/nuvitae/issues/156) : essai borné des
  nouvelles méthodes agentiques ;
- [#127](https://github.com/sangimed/nuvitae/issues/127) : SBOM/provenance
  lors d'une chaîne de publication effective ;
- [#77](https://github.com/sangimed/nuvitae/issues/77) et
  [#78](https://github.com/sangimed/nuvitae/issues/78) : durcissement
  infrastructure et identité Hosted ;
- [#41](https://github.com/sangimed/nuvitae/issues/41) : cadre légal
  à conclure avant les premiers revenus ;
- [#39](https://github.com/sangimed/nuvitae/issues/39) : EventStorming
  seulement sur ambiguïté de domaine démontrée ;
- [#31](https://github.com/sangimed/nuvitae/issues/31) et
  [#30](https://github.com/sangimed/nuvitae/issues/30) : i18n interface
  et multilingue des CV, à distinguer ;
- [#24](https://github.com/sangimed/nuvitae/issues/24) : POC observabilité
  lorsque les difficultés opérationnelles le justifient.

## Vues recommandées dans le Project existant

Les filtres ci-dessous ciblent les **éléments présents dans le Project**.
Les labels sont déjà présents sur GitHub, mais les vues **restent à configurer
dans l'interface Projects V2**. Ne pas créer de nouveau Project.

### 1. Cockpit (table)

- Objectif : distinguer les horizons et les décisions à arbitrer.
- Filtre de base : `repo:sangimed/nuvitae is:issue is:open label:roadmap`.
- Colonnes utiles : Title, Status natif, Assignees, Labels, Linked PRs (si
  disponible). Éviter les champs supplémentaires sans usage concret.
- Filtre temporaire de décision : `is:open label:"needs:decision"`.
- Ordre opérationnel : examiner NOW puis les décisions ; les NEXT/LATER ne
  deviennent pas automatiquement « In progress ».

### 2. Current Cycle (board)

- Filtre : `repo:sangimed/nuvitae is:issue is:open label:"horizon:now"`.
- Grouper par le **Status natif existant** si le tableau le permet ; ne pas
  remplacer une colonne active sans vérifier sa signification.
- Une seule initiative principale : #61. Au plus deux flux techniques
  indépendants, si leur coordination et leurs preuves le permettent.
- Ne pas affecter des statuts « Done » ou « In progress » sur la seule base
  d'une PR ouverte ou d'une exécution de test historique.

### 3. Release Readiness (table)

- Filtre possible **après ajout des PR au Project** :
  `repo:sangimed/nuvitae is:open label:"horizon:now","release:community-alpha"`.
- Les huit PR #152/#159–#165 sont **labellisées**, mais leur présence
  dans Projects V2 n'a pas été vérifiée. L'ancien auto-add basé sur
  `is:issue` ne les ajoute pas.
- Suivre par liens directs : candidat exact, résultat du gate A, intégration
  finale, B (installation), C (sessions), D (vrai fournisseur sous
  autorisation), E (sécurité/qualité) et verdict final.
- Pour l'instant, le statut produit est **NOT READY** ; ne pas le faire
  passer en READY automatiquement dès qu'une CI de PR est verte.

### 4. Backlog / Later (table)

- Filtre : `repo:sangimed/nuvitae is:issue is:open label:"horizon:next","horizon:later"`.
- Trier ou filtrer par label d'horizon selon les possibilités de la vue ;
  ne pas inventer de date ou de priorité P0 sans preuve.
- Faire remonter un ticket vers NOW seulement en documentant le résultat
  produit attendu, son déclencheur et le travail qu'il déplace.

Les valeurs multiples d'un même champ de filtre sont traitées en **OU** dans
GitHub Projects, tandis que des champs différents se combinent en **ET**.
Une vue doit être **enregistrée** après modification.

## Vérification encore requise dans GitHub Projects V2

- [ ] Identifier l'URL et le propriétaire du Project existant ;
- [ ] Vérifier que l'automatisation d'ajout est encore activée et cible bien
  `sangimed/nuvitae` ;
- [ ] Vérifier que les 17 issues labellisées sont réellement des cartes du
  Project ; ajouter uniquement celles qui manquent ;
- [ ] Vérifier les colonnes Status et les statuts existants, sans les écraser ;
- [ ] Créer ou adapter les quatre vues et enregistrer chaque filtre ;
- [ ] Ajouter les huit PR alpha à la vue Release Readiness, sans changer leur
  statut de merge ;
- [ ] Confirmer en lecture le nombre de cartes, les horizons affichés et la
  cohérence entre les filtres et les labels ;
- [ ] Renseigner les décisions #118/#126/#158 et les PR différées sans
  transformer une proposition en clôture.

**Limite d'outillage de cette passe :** l'application GitHub connectée donne
accès à la lecture et aux modifications d'issues/PR, mais ne propose pas
l'administration de Projects V2 (champs, vues, items). Les actions ci-dessus
nécessitent l'interface GitHub Projects ou un outil GraphQL disposant de
`read:project` et `project` adaptés.

## Règles pour les prochaines mises à jour

- Chaque nouvelle issue de roadmap a `roadmap` et un **unique** horizon.
- Tout changement d'horizon doit être explicite et justifié par une décision
  de produit, pas par la simple disponibilité d'un agent.
- Les PR de qualifications sont identifiées par
  `release:community-alpha` ; une PR ouverte n'est pas un objectif livrable.
- Le champ Status du Project reflète le travail en cours, les labels
  reflètent l'horizon de priorité. Les deux ne sont **pas synonymes**.
- Garder la description et les critères d'acceptation dans l'issue ;
  le statut release dans #61 ; les choix produits dans la roadmap.
- Limiter les commentaires de synchronisation au contexte utile, éviter de
  copier des tableaux d'état sur chaque issue.
- À la clôture d'une issue, préserver les preuves et vérifier sa sortie
  des vues ouvertes ; ne pas supprimer son historique.

## Sources

- [Roadmap produit](product-roadmap.md)
- [État de référence](status-baseline-2026-11-06.md)
- [GitHub Docs — filtering Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects)
- [GitHub Docs — saved views](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/managing-your-views)
- [GitHub Docs — auto-add](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)
