# Community alpha — préflight du main intégré, 7 novembre 2026

**Community alpha : NOT READY. Gate canonique : NOT RUN. B/C/D : NOT RUN.**
Ce rapport prépare #158 et #61 ; il ne remplace aucun résultat historique de
[la checklist](community-alpha-readiness.md) ni
[le protocole B/C/D](community-alpha-qualification-protocol-2026-11-07.md).

## Candidat et CI

`origin/main`, vérifié par fetch :
`2ce0f169cef6d187645069a40b32e96d38437f95` (fusion #172).
Main local initial identique, divergence 0/0 ; aucun changement local initial.

Les quatre exécutions **push après fusion**, toutes sur ce SHA, sont terminées
avec succès ; ce sont des preuves distinctes des checks de #172 :

| Workflow           | Statut | Preuve                                                                                                          |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------- |
| Quality gates      | PASS   | [42372333972](https://github.com/sangimed/nuvitae/actions/runs/42372333972)                                     |
| Documentation      | PASS   | [42372333931](https://github.com/sangimed/nuvitae/actions/runs/42372333931)                                     |
| Design system lint | PASS   | [42372333864](https://github.com/sangimed/nuvitae/actions/runs/42372333864)                                     |
| Security analysis  | PASS   | [42372333887](https://github.com/sangimed/nuvitae/actions/runs/42372333887), jobs Secret scan et CodeQL success |

CodeQL success ne signifie pas absence des alertes historiques ouvertes.
Quality gates ne lance ni le parseur réseau coupé ni le gate navigateur complet.
Le gate historique sur `0ee8780` ne qualifie pas ce SHA.

Le dernier [Container security 42367500029](https://github.com/sangimed/nuvitae/actions/runs/42367500029)
porte sur **l'ancien** `fcf8551fe7fcb3f9015741c1aefea719053c24ca` : configuration
Dockerfiles/Compose PASS, scans runtime web/api/worker FAIL. Les scans runtime
du candidat actuel sont **NOT RUN** ; ils restent une preuve de release à obtenir,
sans attribuer automatiquement les anciennes vulnérabilités au nouveau candidat.

## Préservation et environnement

Snapshot privé effectué et vérifié avant les modifications par le responsable
de mission. Le lanceur `scripts/run-agent-safe.sh` est absent. Rapport rédigé
sur une branche et un worktree neufs issus du SHA ci-dessus.

Préflight en lecture seule, aucun service applicatif démarré par ce chantier :

| Contrôle                                                                                                    | Statut / sortie                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker version`                                                                                            | PASS, exit 0 : client/Engine 29.9.2, Docker Desktop 4.98.0, linux/amd64                                                   |
| `docker compose version`                                                                                    | PASS, exit 0 : v5.6.1 ; support des overlays `!override` vérifié par config                                               |
| `docker info`                                                                                               | PASS, daemon accessible ; 16 CPU, 16 727 072 768 octets RAM                                                               |
| `command -v bash`                                                                                           | PASS, `/usr/bin/bash`                                                                                                     |
| `df -h .`, `free -h`                                                                                        | PASS, exit 0 : 909 GiB disque, environ 13 GiB RAM disponibles côté hôte ; disponibilité réelle pendant build non garantie |
| Ports 3000/3001 (`ss -ltn`)                                                                                 | PASS, exit 0 : aucune écoute au préflight ; revérifier avant exécution                                                    |
| Config canonique puis overlay local avec interpolation synthétique et environnement filtré                  | PASS, exit 0 pour les deux ; aucun secret lu ou imprimé                                                                   |
| `bash -n scripts/community-alpha-deterministic-gate.sh scripts/local-play-e2e.sh scripts/local-play-env.sh` | PASS, exit 0, syntaxe uniquement                                                                                          |
| Gate / builds / tests applicatifs                                                                           | NOT RUN par ce chantier ; autorisation de nettoyage absente                                                               |

Le daemon est **partagé**, avec un PostgreSQL sain du projet d'intégration
précédent, des conteneurs de checks conservés et de nombreux volumes existants.
Les volumes des projets par défaut `nuvitae` et `nuvitae-local-play` existent.
Ne jamais exécuter le gate avec ses noms par défaut sur ce daemon.

Le nom proposé `nuvitae-alpha-gate-20261107-2ce0f169` ne possède aucun conteneur,
volume ou réseau étiqueté au préflight (trois recherches exit 0, zéro résultat).
Revérifier noms **et** labels avant lancement : l'absence de label ne suffit
pas à autoriser la réutilisation d'une ressource portant le même nom.

## Effets du gate et frontière d'autorisation

Scripts inspectés : gate canonique, `local-play-e2e.sh`, son enfant sourcé
`local-play-env.sh`, Compose principal/local, Dockerfiles/entrypoints workspace,
worker et test, scripts package, configurations Vitest/Playwright et helpers de
persistance/nettoyage. `local-play-up.sh` et `local-play-down.sh` ne sont pas
appelés par ce gate ; le premier supprime aussi ses logs temporaires.

| Opération                                                                                              | Ressources / effet                                                                                                         | Risque et limite nécessaire                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compose build workspace` puis builds api/web/worker/web-production-policy/playwright-test/parser-test | Images globales `nuvitae-{workspace,api,web,worker,web-production-policy,playwright-test,parser-test}:0.1.0`, cache Docker | Le nom de projet n'isole pas les tags ; utiliser un daemon dédié sans ces images pour éviter de déplacer des tags existants                                              |
| `compose run --rm ...`                                                                                 | Conteneurs one-shot de ce projet, retirés automatiquement                                                                  | Suppression interdite sans exception humaine précise ; dépendances postgres/queue démarrent dès le premier workspace                                                     |
| `pnpm install`, `pnpm build`, génération fixture                                                       | Volumes node_modules/store ; sorties `dist`, `.next`, artefacts et PDF synthétique dans le worktree                        | Nest API/worker `deleteOutDir: true` ; Playwright réutilise/nettoie son répertoire de sortie entre phases ; exception limitée aux sorties générées dans la copie jetable |
| `pnpm test`, intégration persistance                                                                   | Fichiers temporaires synthétiques ; base `nuvitae_test`, schémas aléatoires `test_*`                                       | Helpers retirent leurs répertoires et font `DROP SCHEMA ... CASCADE` ; uniquement données créées par cette exécution dans PostgreSQL neuf                                |
| Parseur et worker                                                                                      | Répertoires temporaires, readiness et staging ; tmpfs parseur 768 MiB                                                      | Suppression de fichiers temporaires au retour/shutdown ; parseur-test `network_mode: none`, no-new-privileges, caps supprimées                                           |
| `db:migration:run`, stockage                                                                           | Base `nuvitae` dans volume neuf ; `chown -R 10001:10001 /var/lib/nuvitae/private` dans volume neuf                         | Mutation réelle ; ne monter aucune donnée existante ; migration d'une base neuve seulement                                                                               |
| `up -d --force-recreate api/web/worker`                                                                | Conteneurs de ce projet, identités synthétiques par lot et mode worker E2E/production                                      | Remplacement et arrêt de services ; exclusivement ressources neuves                                                                                                      |
| Trap EXIT/INT/TERM : `compose --profile test down --remove-orphans`                                    | Conteneurs du projet et réseau `${COMPOSE_PROJECT_NAME}_default` ; orphelins du même projet                                | Nettoyage même après échec, échec du cleanup ignoré ; vérifier inventaire final indépendamment                                                                           |
| Logs et traces d'échec                                                                                 | `.local-play/artifacts`, logs Compose tail 200, traces Playwright                                                          | Redaction par motifs limitée ; traiter tous artefacts comme privés, ne jamais publier les fichiers bruts                                                                 |
| Réseau                                                                                                 | web loopback 3000 ; overlay API loopback 3001 ; PostgreSQL/Valkey internes                                                 | Dépendances/builds/audit ont accès externe ; aucune session fournisseur ni configuration réelle héritée                                                                  |

Aucun `down -v` dans le gate : les volumes doivent rester conservés. Les
volumes nouveaux attendus sont `${COMPOSE_PROJECT_NAME}_` suivi de :
`pnpm-store`, `root-node-modules`, `web-node-modules`, `api-node-modules`,
`worker-node-modules`, `contracts-node-modules`, `domain-node-modules`,
`extraction-node-modules`, `import-application-node-modules`,
`persistence-node-modules`, `storage-node-modules`, `fixtures-node-modules`,
`postgres-data`, `queue-data`, `private-storage`. Réseau nouveau : suffixe
`default`. Les conteneurs de services/one-shot prennent le même préfixe de
projet ; aucun `container_name` global imposé. Le projet explicite doit rester
identique pour le Compose principal et le sous-script local.

## Proposition d'une seule exécution

**Précondition recommandée :** environnement Docker dédié, sans images/tags,
conteneurs, volumes ni réseau préexistants et sans credential fournisseur ;
copie/worktree neuf du SHA figé, snapshot vérifié, ports libres. Ne pas installer
ni provisionner automatiquement ce daemon. Aucun montage des volumes existants,
aucun fichier `.env`/`.community.env` utilisateur, aucun lien symbolique vers des
données existantes. Arrêt si une de ces conditions n'est pas démontrée.

Depuis cette copie exacte et sur ce daemon dédié, commande proposée, **non exécutée** :

```sh
env -i HOME="$HOME" PATH="$PATH" \
  COMPOSE_PROJECT_NAME=nuvitae-alpha-gate-20261107-2ce0f169 \
  COMPOSE_DISABLE_ENV_FILE=1 \
  LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" \
  bash scripts/community-alpha-deterministic-gate.sh
```

Le daemon/context doit être le défaut du compte dédié vérifié ; si un contexte
explicite est nécessaire, sa sélection doit être fixée et approuvée avant le
lancement. Ne pas diriger implicitement cette commande vers le daemon partagé.
Les secrets synthétiques d'interpolation sont ceux du script officiel, jamais
des credentials Community ou fournisseur. Aucun paramètre/assertion modifié.

Autorisation humaine à demander : **une seule exécution du script officiel sur
ce SHA, dans cet environnement dédié et sous ce nom de projet, avec permission
strictement limitée à la création/recréation/retrait de ses conteneurs one-shot
et services, de son réseau, des fichiers temporaires/sorties générées dans sa
copie jetable et de ses seuls schémas synthétiques aléatoires dans sa nouvelle
base `_test`. Les volumes, le worktree, les snapshots et les preuves sont
conservés. Aucune suppression ou mutation de ressource préexistante, aucun
prune, reset, fournisseur réel, B/C/D, merge ou publication.**

C'est une exception nécessaire aux interdictions AGENTS.md et à la frontière
explicite de la mission ; aucun accord n'est présumé par ce rapport.

PASS : sortie du gate 0, toutes phases attendues effectuées sur le SHA figé,
inventaire final préservé, pas d'appel réel, aucune ressource hors périmètre.
FAIL : phase/assertion non conforme ou sortie non nulle ; conserver le premier
échec sans retry. BLOCKED : collision, données/credentials hérités, capacité ou
assainissement insuffisant, exception absente. Le message final seul ne prouve
pas le succès du cleanup puisque celui-ci masque ses erreurs.

Points d'arrêt : avant lancement sur précondition manquante ; premier échec
pendant le gate ; après la sortie pour vérifier inventaire et assainir les
preuves. Le trap peut déjà retirer conteneurs/réseau en cas d'échec. Reprise :
analyser les preuves privées, corriger sur branche, puis demander une nouvelle
exécution bornée ; jamais relancer jusqu'à obtenir PASS ni réutiliser la base
sans examen. Aucun nettoyage supplémentaire après exécution.

## Cohérence B/C/D avec le code intégré

Revue statique uniquement ; aucun PASS d'installation ou de session revendiqué.

- B : bootstrap supporte `NUVITAE_COMMUNITY_CONFIG_PATH`, refuse le remplacement
  d'une configuration existante, génère secrets sans les imprimer et permissions
  0600 ; Compose API lance les migrations, worker non. Le protocole exige bien
  configuration neuve, loopback et Local Play désactivé.
- C : `CommunityAuthService` crée sessions aléatoires, conserve le hash côté
  serveur, vérifie expiration et révocation ; controller sérialise HttpOnly,
  Secure en production, SameSite=Strict, Path=/ et Max-Age. TTL supporté de
  300 à 604800 secondes, défaut 86400 : une attente réduite nécessite la
  configuration dédiée déjà prévue par C3. C4 ne prétend pas prouver seul une
  isolation même-base à partir de deux installations distinctes.
- Persistance/reprise : données, sessions et état fournisseur reposent sur
  PostgreSQL/private-storage nommés ; `stop/start` du protocole les conserve.
  Import/revue/confirmation et export PDF existent ; leur succès Community
  réel, l'ordre PDF et l'absence de perte ne sont pas établis par lecture.
- D : adaptateur effectivement enregistré `CodexDirectProviderAdapter`, avec
  transport direct et adaptateur d'édition contextuelle ; aucun fournisseur
  arbitraire promis. Le provider d'import est explicitement un appel et le job
  d'extraction a une tentative ; cela ne remplace pas l'inspection finale des
  chemins autorisation/refresh/proposition et le comptage réel exigé par D.
  Budget, compte et plafond toujours non approuvés ; aucun appel effectué.

Aucune erreur documentaire bloquante démontrée dans le protocole B/C/D ; aucune
modification d'assertion ni de protocole nécessaire ici. Après A PASS, B/C restent
soumis à autorisation distincte dans un environnement Community supporté.
D nécessite ensuite B/C acquis, fournisseur/compte/CV synthétique approuvés,
compteurs, plafond financier et tentatives explicitement approuvés.
Les alertes CodeQL, #118, #126 et contrôles E restent indépendants du gate A.

## Validation du document

Projet de contrôle indépendant `alpha-preflight-20261107` : workspace seul avec
`docker compose run --no-deps --name <nom-neuf> workspace ...`, sans `--rm`,
aucun service PostgreSQL/queue démarré, aucun nettoyage. Volumes et conteneurs
de contrôle conservés ; interpolation synthétique et environnement filtré.
`pnpm install --frozen-lockfile`, Prettier sur ce document et `git diff --check`
sont les contrôles adaptés à cette modification documentaire ; tests produit,
lint/typecheck applicatifs et gate complet ne sont pas réexécutés ici. Les
contrôles CI de cette PR doivent être observés séparément avant intégration.
