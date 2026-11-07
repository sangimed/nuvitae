# Candidat d’intégration Community alpha — 7 novembre 2026

**Verdict : NOT READY — draft d'intégration, pas release.** Refs #61 et #158.
La revue de pilotage autorise composition, contrôles non destructifs et draft PR ;
ni merge, ni déploiement, ni B/C/D, ni fournisseur réel.

## Sources et état initial

- Main distant vérifié : `fcf8551fe7fcb3f9015741c1aefea719053c24ca`.
- Main local préservé : `663bf6a3fc83cb3dcd3bc22ed1cd583ceae907e7`, propre.
- Base commune des huit PR : `663bf6a3fc83cb3dcd3bc22ed1cd583ceae907e7`.
- Candidat historique : `0ee8780dfe10fc60fb221297971142747ac2fe2e`.
- Nouveau candidat fonctionnel : `e2ca9bc48fdb99aafcab379cf8166283b1519f21`. Les commits suivants ajoutent
  uniquement le présent rapport et le protocole ; le HEAD documentaire final
  est celui de la draft PR, sans référence SHA circulaire dans son propre texte.
- Branche : `release/community-alpha-integration-20261107`.
- Worktree dédié : `/home/sangimed/Repositories/nuvitae-alpha-integration-20261107`.

Sources lues : AGENTS.md, README.md, roadmap, baseline du 6 novembre,
checklist release, gate canonique et enfants, workflows, issues #61/#158/#118/#126
et [preuve du 29 octobre](https://github.com/sangimed/nuvitae/issues/61#issuecomment-6508922525).
Les deux documents de pilotage absents du checkout ancien ont été lus depuis
`origin/main` après fetch. Les huit PR sont OPEN, non fusionnées, et leurs HEAD
courants correspondent exactement au mandat : aucun écart de version à intégrer.
Permissions GitHub push/admin vérifiées ; auto-merge du dépôt désactivé.
Aucune branche ni PR d'intégration équivalente n'existait au préflight.

## Préservation

Inventaire initial : 24 worktrees, trois stashes, checkout principal propre ;
anciens espaces alpha/Orca, snapshots et preuves conservés. Le launcher
`scripts/run-agent-safe.sh` est absent de main ancien et courant.
Snapshot privé récupérable :
`/home/sangimed/Repositories/nuvitae-integration-snapshot-20261107T125758`.
Il contient archives des fichiers suivis/non suivis de chaque worktree,
index, états Git, liste des stashes et bundle de toutes les références.
Les configurations ignorées ne sont ni lues ni déplacées ; elles restent intactes.
Les inventaires Docker ne contiennent que noms/identifiants et restent privés.
Aucun nettoyage, suppression de fichier utilisateur, branche, stash, worktree,
volume ou base existante. Conteneurs de contrôle retenus sans `--rm`.

## Composition traçable

`git diff --binary <base-commune> <source-head>` pour chaque PR ; vérification
`git apply --check`, application `git apply --index`, `git diff --cached --check`
et commit dédié avec Source-PR/Source-Head/Source-Base. Aucun merge de branche
indépendante ; le diff complet de #152 inclut ses deux commits sources.
Aucun conflit ni résolution manuelle ; le chevauchement #160/#163 s'applique
sans perte. Les 25 fichiers fonctionnels/de tests du lot sont présents.

| PR   | HEAD source vérifié                        | Commit de composition                      |
| ---- | ------------------------------------------ | ------------------------------------------ |
| #152 | `90205dbe37988bd0e1927be8b0c6d76688fe2027` | `ef6e779c504eae20045939e0d3584f587d7712ce` |
| #159 | `def71d6900b10156691c268ff7137f74b027fb31` | `267ad439964a7c79f8b899e0e6a5a45726f4dbd9` |
| #160 | `0acaad110cda78ea9ef3ef66826e990e15ec7179` | `538a2376a8503d09a4e566a78eebb04865efb5e5` |
| #161 | `8d6fb3c8a3502c04b0d7c33a88b404617fa35913` | `d06ca9244611c2f5560c73192ff1edb27a775dd5` |
| #162 | `f0bf6649d6b7f1508dcc8433d49e3a030b74be68` | `3c3e9477983cf531d63aa9029cb48481a0cecfc5` |
| #163 | `42cdc636e4634dd67123aa80387bcf299ba19754` | `3406774db08067eda731d8d02a17fa0be234a536` |
| #164 | `cbac3142d99ddb16fd4c8a3126fa486cc69fd735` | `0051295461a04018433ec85ae16bc0bd78088c48` |
| #165 | `e38fccca288a17dee6ecee8357d44b3ca9483f99` | `e2ca9bc48fdb99aafcab379cf8166283b1519f21` |

#130 est fermée/superseded ; #133 et #157 sont exclues. Aucun changement
GitHub Actions/de développement issu de ces deux dernières PR n'est importé.
Les changements dev directs de #152 (Nest/TypeORM) font partie de son diff
qualifié, pas de #157. Aucun nouveau package ni abstraction opportuniste.
Multer reste borné à 2.x avec justification GHSA existante dans le workspace.

## Comparaison exacte avec le candidat historique

Pour **chacune des huit étapes**, `git diff --binary <étape-historique>
<étape-nouvelle>` égale octet pour octet `git diff --binary <ancien-main>
<nouveau-main>`. Ce contrôle couvre le résultat combiné, les chevauchements,
le lockfile, les manifests et tous les tests, sans supposer des patch IDs égaux.
Les étapes historiques sont celles du commentaire de référence #61.

Avant documentation de mission, seuls ces cinq fichiers diffèrent de `0ee8780` :

- `.github/workflows/validate-project-sync.yml`
- `docs/project/github-projects-operating-guide.md`
- `docs/project/product-roadmap.md`
- `docs/project/status-baseline-2026-11-06.md`
- `scripts/sync-github-project.ps1`

Ils proviennent exactement des six commits main #166–#171 (905 insertions).
L'ensemble du code applicatif, des tests et des dépendances est identique à
`0ee8780`. Les deux seuls ajouts propres à la mission sont ce rapport et
[le protocole B/C/D](community-alpha-qualification-protocol-2026-11-07.md).
Aucune réécriture de conclusions historiques ni modification de roadmap.

## Environnement et contrôles

Linux/zsh ; Docker Engine 29.9.2 ; Compose v5.6.1 ; image workspace du
Dockerfile canonique Node 24.15.0/pnpm 11.15.1. Projet neuf
`nuvitae-alpha-integration-20261107`, collisions vérifiées avant création.
Environnement de sous-processus explicitement limité à PATH/HOME, nom du projet
et valeurs déterministes d'interpolation ; aucun credential fournisseur hérité.
Workspace `--no-deps` : seul PostgreSQL du projet neuf est démarré pour les tests
ciblés de persistance ; pas de serveur Community ni parcours utilisateur B/C.
Les schémas de test à suffixes aléatoires sont explicitement jetables selon
AGENTS.md/README ; seuls ces schémas sont retirés par le helper inspecté, jamais
une base existante. Base de bootstrap vide et volumes conservés.

Commandes et codes exacts : voir matrice ci-dessous. Les logs privés et les
résultats JSON sont conservés dans le snapshot, sans publication de payloads.
Les contrôles portent sur `e2ca9bc48fdb99aafcab379cf8166283b1519f21` avec le protocole documentaire en cours
de rédaction ; aucun changement fonctionnel ultérieur.

Toutes les commandes Docker ci-dessous utilisent le projet inédit indiqué,
les valeurs déterministes d'interpolation (pas des credentials réels), et
`docker compose run --no-deps --name <conteneur-neuf> workspace <commande>`
pour les commandes pnpm. Pas de `--rm`, pas de nettoyage. Exécution du
7 novembre 2026, environ 11:59–12:04 UTC ; SHA fonctionnel ci-dessus.

| Contrôle / commande                                                                                                                                                                                       | Résultat           | Exit | Diagnostic                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| `git apply --check`, `git apply --index`, `git diff --cached --check` à chaque étape                                                                                                                      | PASS               | 0    | Huit diffs complets, sans conflit                                                                                         |
| Comparaison des huit arbres historiques/nouveaux par `git diff --binary`                                                                                                                                  | PASS               | 0    | Seul delta exact de main à chaque étape                                                                                   |
| `git diff --check origin/main HEAD` et `git diff --check`                                                                                                                                                 | PASS               | 0    | Aucune erreur d'espacement                                                                                                |
| `git bundle verify <snapshot>/all-refs.bundle`                                                                                                                                                            | PASS               | 0    | Bundle récupérable                                                                                                        |
| `docker compose config --quiet`                                                                                                                                                                           | PASS               | 0    | Compose canonique, interpolation déterministe                                                                             |
| `docker compose build workspace`                                                                                                                                                                          | PASS               | 0    | Dockerfile/entrypoint inspectés, image absente avant création                                                             |
| `pnpm install --frozen-lockfile`                                                                                                                                                                          | PASS               | 0    | 704 packages installés ; lockfile inchangé ; 784 entrées passent les règles supply-chain                                  |
| `pnpm format:check`                                                                                                                                                                                       | PASS               | 0    | Tous fichiers conformes au moment du contrôle ; contrôle documentaire final séparé                                        |
| Contrôle documentaire final : `pnpm format:check` après rédaction des deux documents                                                                                                                      | PASS               | 0    | Contrôle final global réussi ; aucun changement fonctionnel                                                               |
| `pnpm lint`                                                                                                                                                                                               | PASS               | 0    | 0 erreur, 6 avertissements React Hooks existants                                                                          |
| `pnpm typecheck`                                                                                                                                                                                          | PASS               | 0    | Workspace et configuration d'intégration                                                                                  |
| `pnpm audit --prod --audit-level high`                                                                                                                                                                    | PASS               | 0    | Aucune vulnérabilité connue au moment de l'audit                                                                          |
| `pnpm exec vitest run apps/api/src/import-resume/use-cases/start-import.test.ts tests/architecture/local-play-batch-isolation.test.ts`                                                                    | PASS               | 0    | 25 tests / 2 fichiers ; concurrence publication/état, échecs bornés, quotas et identité serveur                           |
| `docker compose up -d --wait postgres`                                                                                                                                                                    | PASS               | 0    | PostgreSQL de test neuf, pas une installation Community B                                                                 |
| `pnpm exec vitest run --config vitest.persistence.config.ts tests/integration/persistence/test-database.integration.test.ts tests/integration/persistence/local-play-batch-admission.integration.test.ts` | PASS               | 0    | 6 tests / 2 fichiers ; bootstrap concurrent, identifiants invalides et isolation quotas persistés                         |
| `bash -n scripts/community-alpha-deterministic-gate.sh scripts/local-play-e2e.sh scripts/local-play-env.sh`                                                                                               | PASS               | 0    | Analyse syntaxique seulement                                                                                              |
| `sh -n scripts/community-bootstrap.sh scripts/community-owner-secret.sh`                                                                                                                                  | PASS               | 0    | Analyse syntaxique seulement ; aucune initialisation réelle                                                               |
| Gate canonique complet `scripts/community-alpha-deterministic-gate.sh`                                                                                                                                    | NOT RUN            | —    | Enfant E2E fait `down --remove-orphans`, recrée des services et collecte des logs ; mission exclut ce gate avec nettoyage |
| `pnpm test` et suite persistance complète                                                                                                                                                                 | NOT RUN            | —    | Sélection ciblée inspectée exécutée ; pas de nouvelle preuve exhaustive, aucune reprise des comptes historiques           |
| `pnpm build`                                                                                                                                                                                              | BLOCKED            | —    | Nest `deleteOutDir: true` ; pas d'autorisation de suppression et aucun contournement de configuration                     |
| Parseur isolé et navigateur réels                                                                                                                                                                         | NOT RUN            | —    | Pas de gate complet, pas de stack Local Play lancée ; assertions navigateur intégrées mais non réexécutées                |
| Scanners Gitleaks/CodeQL/Trivy et docs Docker                                                                                                                                                             | NOT RUN localement | —    | Workflows inspectés ; résultats CI à observer sur HEAD publié, pas assimilés à des PASS                                   |
| Community B/C/D, authentification/appel fournisseur                                                                                                                                                       | NOT RUN            | —    | Hors autorisation ; protocoles seulement                                                                                  |
| Phase E complète                                                                                                                                                                                          | NOT RUN            | —    | Tests négatifs ciblés seuls, contrôles administratifs et sécurité complémentaires encore requis                           |

Préservation vérifiée après contrôles : les 24 worktrees préexistants ont
les mêmes statuts et contenus archivés ; trois stashes identiques ; main local
inchangé et main distant toujours `fcf8551…`. Ressources Docker initiales :
0 conteneur, 399 volumes, 3 réseaux ; aucune ressource manquante après contrôle.
À 12:04 UTC : 9 conteneurs de contrôle retenus, 14 nouveaux volumes et un réseau
supplémentaire ; d'autres conteneurs documentaires peuvent être conservés ensuite.
Les avertissements Compose de conteneurs orphelins sont attendus parce que les
conteneurs terminés sont préservés ; aucune option de nettoyage n'est utilisée.

Le gate historique avait exit exact 0, 1 911 tests applicatifs, 55 tests de
persistance, quatre parseur et 26 navigateur, audit sans vulnérabilité connue.
**Ce sont uniquement les preuves de `0ee8780`, jamais des PASS du nouveau SHA.**

## Publication et CI

Workflows inspectés avant publication : quality (format/lint/types/tests/
persistance/build/audit), docs, design-lint, security-analysis (Gitleaks/CodeQL).
Aucun déploiement, authentification ou appel fournisseur réel ; runners GitHub
éphémères avec ressources Compose propres. Le workflow Project sync ne se
sélectionne pas sur ce diff et n'exécute que parse/self-test quand sélectionné.
Container-security est schedule/manual, pas déclenché par cette PR. Aucun appel
au gate navigateur canonique dans ces workflows. Aucun workflow modifié.
Les futurs résultats CI doivent être rattachés au SHA exact, et ne sont pas
présumés verts par la simple inspection.

## Risques et décisions restantes

- Phase A complète non réexécutée : demander une autorisation distincte pour
  le gate canonique si ses opérations de nettoyage doivent être exécutées.
- [B/C/D préparés](community-alpha-qualification-protocol-2026-11-07.md),
  **non exécutés**. Choisir l'environnement B/C ; fournisseur, authentification,
  budget d'appels, nombre de tentatives et plafond financier D restent à approuver.
- B/C ne doivent pas être remplacés par Local Play ; l'isolation mono-owner
  réelle n'est pas prouvée par les seules simulations.
- #118 reste ouverte : dépôt désormais public, CodeQL peut s'exécuter ; vérifier
  analyse/SARIF et triage sur le nouveau candidat avant décision sécurité.
- #126 reste ouverte : canal privé surveillé et dry-run puis SECURITY.md requis
  avant publication publique de la release Community ; aucun réglage modifié ici.
- Phase E complète et preuves de distribution restent à qualifier. CI verte ou
  identité des arbres ne vaut ni merge autorisé ni release distribuable validée.

Le candidat peut être examiné pour une **future décision humaine de merge**,
sous réserve des résultats et limites ci-dessus. Aucun merge, déploiement,
changement des PR sources ou clôture d'issue n'est autorisé par ce rapport.
