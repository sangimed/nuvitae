# Community alpha — protocoles B/C/D préparés le 7 novembre 2026

**NOT RUN. Aucune autorisation d'exécution dans cette mission. Community alpha
reste NOT READY.** Complète la [checklist canonique](community-alpha-readiness.md),
sans remplacer ses preuves historiques. Le SHA de la future exécution doit être
figé ; tout changement impose de réévaluer la portée des preuves.

## Conditions communes et préservation

Le fondateur doit autoriser séparément l'exécution B/C, l'environnement et les
ressources créées. Lire à nouveau AGENTS.md, les scripts et leurs enfants.
Inventorier conteneurs, volumes, réseaux, images, ports, worktrees et configuration
avant/après ; prendre un snapshot privé récupérable. Choisir un nom Compose
inédit et vérifier l'absence de collision de toutes ses ressources. Ne jamais
réutiliser une base, un volume ou une session existante. Une collision arrête
le scénario ; aucun nettoyage automatique. Conserver toutes les ressources.

Utiliser uniquement Docker Compose et la configuration Community normale de
[la procédure d'installation](../community-installation.md), Local Play désactivé.
Pas de contournement d'authentification, pas de secret en argument ou preuve.
Aucun fournisseur connecté durant B/C. Ne pas appeler les scripts Local Play.
Sur Orb, obtenir et fournir le lien portail courant ; ne pas exposer de callback
Codex ni de service interne. Un portail distant non compatible avec le modèle
Community loopback exige un environnement supporté, pas une baisse de sécurité.

Pour chaque scénario : date UTC, SHA, versions, commande expurgée, statut
PASS/FAIL/BLOCKED/NOT RUN, sortie exacte si applicable et assertions booléennes.
Pas de captures, traces réseau, cookies, CV, références privées, prompts ou
réponses dans les preuves. Toute preuve impossible à assainir est BLOCKED.

## Phase B — installation fraîche

| Scénario               | Prérequis                                                 | Étapes prévues                                                                                                                                                        | Résultat attendu / preuves                                                                                           | Risques / autorisation future                                                                 |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| B1 Préflight           | Docker/Compose, Git, capacité disque ; SHA figé           | Vérifier versions, projet inédit, ports et inventaire ; inspecter bootstrap et Compose                                                                                | Aucun nom/volume préexistant utilisé ; inventaire et SHA consignés                                                   | Collision : arrêt ; autorisation B et création de ressources nécessaire                       |
| B2 Configuration       | B1 PASS ; chemin privé neuf                               | Générer la configuration avec `sh scripts/community-bootstrap.sh` et le chemin neuf documenté ; vérifier permissions et relance idempotente sans afficher les secrets | Configuration privée conservée, Local Play false, Secure true, aucune rotation à la relance                          | Aucun écrasement ; autorisation B ; config générée jamais commise                             |
| B3 Premier démarrage   | B2 PASS                                                   | Avec le même projet et `--env-file`, `config --quiet`, puis `up -d --build` et `up --wait`                                                                            | postgres/queue/api/worker/web sains ; migrations API seulement ; web seul publié sur loopback ; interface accessible | Build/start créent images et volumes : autorisation B ; aucun fournisseur                     |
| B4 Reprise/persistance | B3 PASS ; C autorisée pour créer un brouillon synthétique | Enregistrer un brouillon via session normale ; `stop` puis `start`, `up --wait` sur ce seul projet ; rouvrir                                                          | Même brouillon et même identité ; inventaire avant/après, booléens de santé et conservation                          | Interruption limitée au projet autorisé ; ne pas utiliser `down`, suppression ou reset        |
| B5 Erreurs bornées     | Installation dédiée autorisée                             | Vérifier champ manquant avec une configuration de test distincte sans secret ; interrompre puis redémarrer uniquement le postgres du projet autorisé                  | Config invalide refusée ; indisponibilité signalée sans données sensibles ; reprise conserve le brouillon            | Interruption explicitement comprise dans B ; jamais éditer/remplacer config ou base originale |

Sortie B : B1–B5 PASS sur le SHA exact, inventaire sans perte, accès normal
et reprise démontrés. Un échec n'autorise ni reset ni essais jusqu'au succès.

## Phase C — propriétaire et sessions réels

Community est mono-propriétaire. Une deuxième identité indépendante pour les
contrôles négatifs exige une deuxième installation isolée autorisée ; aucun
sélecteur d'identité client et aucune mutation directe de base.

| Scénario                      | Prérequis                                                      | Étapes prévues                                                                                                                                                                 | Résultat attendu / preuves                                                                                                    | Risques / autorisation future                                                                                                               |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Anonyme                    | B saine ; navigateur vierge                                    | Ouvrir le produit et demander les lectures protégées sans cookie, puis avec credential invalide                                                                                | Sign-in affiché ; refus serveur sans CV ni référence privée ; codes HTTP seulement                                            | Aucun body privé ; autorisation C                                                                                                           |
| C2 Connexion/reconnexion      | Secret propriétaire récupéré localement par le helper officiel | Saisir dans le formulaire sans capture ; rafraîchir ; fermer/rouvrir navigateur selon durée de session ; déconnexion puis connexion                                            | Session normale conservée selon contrat ; cookie HttpOnly/Secure/SameSite Strict/path `/` ; absent URL et stockage navigateur | Ne conserver aucune valeur de cookie/secret ; autorisation C                                                                                |
| C3 Expiration/révocation      | Session réelle ; durée configurée connue                       | Attendre l'expiration réelle sans modifier horloge/DB ; vérifier refus ; reconnecter ; logout ; tenter une requête avec l'ancienne session gardée uniquement en mémoire privée | Session expirée/révoquée refusée ; aucune réanimation ni fuite ; codes et booléens                                            | Une durée réduite exige une config dédiée approuvée ; aucune valeur de session publiée                                                      |
| C4 Isolation/protection CV    | Deux installations propriétaires autorisées ; CV synthétique   | Créer un CV dans A ; depuis B ou anonymement demander ses ressources import/draft/resume/export/source avec identifiants privés non enregistrés                                | Aucun accès aux données A ; fichiers privés inaccessibles directement ; refus uniformes                                       | Pas de mutation cross-owner ; supplémenter avec tests BOLA déterministes : deux installations seules ne prouvent pas tous les cas même base |
| C5 Identité client non fiable | C2 PASS                                                        | Envoyer owner IDs concurrents en header/query/body sur routes existantes avec session puis sans session                                                                        | Rejet ou identité serveur inchangée conformément au contrat ; jamais autorisation par ID fourni                               | Payloads synthétiques seulement ; aucun affaiblissement serveur                                                                             |
| C6 Privacy/cache              | C1–C5                                                          | Examiner uniquement headers et logs bornés assainis sur pages/API succès/erreur ; vérifier absence des marqueurs synthétiques et credentials sans les afficher                 | no-store sensible, CSP conforme, aucun secret/CV dans logs ; booléens et compteurs                                            | Pas de dump logs/réseau ; si assainissement insuffisant : BLOCKED                                                                           |

Sortie C : tous scénarios PASS avec preuves réelles sur Community, complétés
par les contrôles négatifs serveur applicables. Les simulations Local Play
ne satisfont aucun de ces critères. C4 ne constitue pas une validation Hosted.

## Phase D — fournisseur réel, autorisation future distincte

Aucun token créé, aucune autorisation fournisseur et aucun appel dans cette
mission. Le fournisseur et sa méthode d'authentification seront choisis et
vérifiés contre les adaptateurs réellement implémentés ; ne pas promettre un
fournisseur arbitraire. Ne jamais demander un code d'appareil dans le chat.

Avant exécution, faire approuver explicitement : fournisseur/compte, environnement,
SHA, CV 100 % synthétique, nombre total maximal d'appels, plafond financier et
nombre de tentatives. **Budget approuvé : aucun. Plafond approuvé : aucun.**
La checklist historique prévoit au plus une autorisation, un import/analyse et
une proposition ; ce sont des limites de protocole, pas une autorisation actuelle
ni une équivalence entre action UI et nombre d'appels réseau. Inspecter les retries
SDK/worker/queue avant de démarrer : tout retry automatique réel doit être absent,
sinon BLOCKED jusqu'à résolution explicitement autorisée. Aucun retry manuel.

CV proposé : personne fictive « Camille Exemple », adresse `camille@example.invalid`,
entreprises inventées, dates et compétences fictives ; aucun renseignement réel,
aucun document récupéré dans un volume utilisateur. Approuver le fichier et son
empreinte avant upload, garder les artefacts privés.

| Scénario               | Prérequis                                                  | Étapes prévues                                                                                                                  | Résultat attendu / preuves                                                                              | Risques / autorisation future                                                                            |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D1 Connexion           | B/C PASS ; budget et fournisseur approuvés                 | Une authentification via parcours supporté ; refresh et reprise sur projet dédié                                                | État prêt persistant ; compteurs d'autorisation seulement                                               | Secrets côté serveur ; aucun traceur ; autorisation D obligatoire                                        |
| D2 Import/revue        | CV synthétique approuvé ; compteur disponible              | Import unique ; observer traitement ; revoir provenance/incertitudes ; corriger puis confirmer explicitement                    | Aucun contenu IA accepté tacitement ; informations rattachées aux sources ; confirmation avant création | Stop au premier échec, budget atteint ou appel imprévu ; pas de relance                                  |
| D3 Édition/sauvegarde  | D2 PASS                                                    | Modifier un champ synthétique ; vérifier aperçu ; sauvegarder ; quitter puis rouvrir                                            | État sauvegardé et provenance conservés ; booléens sans contenu                                         | Aucun enrichissement IA implicite                                                                        |
| D4 Proposition         | Budget de proposition explicitement approuvé               | Une proposition contextuelle ; contrôler avant/après puis rejeter sans régénérer                                                | Revue obligatoire et rejet sans mutation ; provenance correcte                                          | Compter les appels effectifs, pas seulement les clics ; arrêt si budget non vérifiable                   |
| D5 PDF                 | D3 PASS                                                    | Export PDF dans stockage privé ; vérifier texte sélectionnable, ordre, sections et absence de perte majeure                     | PDF exploitable ; compteurs/booleans seulement                                                          | Artefact synthétique conservé ; aucun upload vers service de comparaison                                 |
| D6 Révocation / source | Nouvelle autorisation précise de révocation et suppression | Préparer révocation fournisseur et scénario canonique « Delete source only » ; exécuter uniquement après accord humain distinct | Credential révoqué refusé ; suppression owner-scoped/idempotente ; CV sauvegardé encore accessible      | **Suppression non autorisée par ce protocole ni par la mission** ; conserver données/volumes sans accord |

Sortie D : B/C acquis, budget respecté et comptabilisé, scénario complet prouvé,
aucune fuite ni acceptation implicite. Dépassement, retry, provenance manquante,
fuite, échec ou impossibilité de compter : FAIL/BLOCKED, jamais retry-until-pass.
Conserver les ressources et les preuves privées ; révocation et nettoyage restent
soumis à approbation humaine. E, #118 et #126 restent à traiter séparément avant
la décision de release. Aucun PASS B/C/D n'est revendiqué par ce document.
