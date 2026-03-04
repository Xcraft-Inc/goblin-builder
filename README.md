# 📘 goblin-builder

## Aperçu

Le module `goblin-builder` est un outil de construction et de packaging polyvalent pour les applications Xcraft. Il permet de générer différents types de packages pour diverses plateformes (Windows, Linux, macOS) et formats de déploiement : applications Electron natives, packages Debian, applications Node.js autonomes, applications web statiques, packages NPX et applications Blitz (exécutables dans un conteneur WebAssembly via WebContainer). Ce module transforme une application Xcraft en un produit déployable en gérant les dépendances, les ressources, les configurations spécifiques à chaque plateforme et les processus de compilation.

## Sommaire

- [Structure du module](#structure-du-module)
- [Fonctionnement global](#fonctionnement-global)
- [Exemples d'utilisation](#exemples-dutilisation)
- [Interactions avec d'autres modules](#interactions-avec-dautres-modules)
- [Configuration avancée](#configuration-avancée)
- [Détails des sources](#détails-des-sources)
- [Licence](#licence)

## Structure du module

Le module est organisé autour de plusieurs constructeurs spécialisés, chacun exposé comme commande Xcraft via un fichier d'entrée à la racine :

- **`electronify.js`** (`app-builder`) : Crée des applications Electron pour Windows, Linux et macOS
- **`debify.js`** (`deb-builder`) : Génère des packages Debian pour Linux
- **`nodify.js`** (`node-builder`) : Crée des applications Node.js autonomes
- **`webify.js`** (`web-builder`) : Construit des applications web statiques (bundle webpack pour navigateur)
- **`blitzify.js`** (`blitz-builder`) : Crée des applications web exécutables dans un conteneur WebAssembly via l'API WebContainer
- **`npxify.js`** (`npx-builder`) : Génère des packages NPX pour distribution via npm

Tous ces constructeurs héritent de la classe de base `lib/builder.js` qui fournit les fonctionnalités communes. Le fichier `lib/service.js` agit comme une factory générique enregistrant les quêtes Goblin communes (`build`, `build-release`, `build-opts`) pour chacun des backends.

## Fonctionnement global

Le processus de construction suit généralement ces étapes principales :

1. **Initialisation** : Lecture du fichier `app.json`, extraction des dépendances locales et construction du `package.json` de release
2. **Préparation des assets** (`_assets`) : Copie des modules locaux dans le répertoire de release avec résolution récursive des dépendances via `extractStartCraft`
3. **Installation des dépendances** (`_installDeps`) : Exécution de `npm install` dans le répertoire de release avec les options appropriées (dev ou production)
4. **Webpack** (`_webpack`) : Compilation des sources JavaScript via [goblin-webpack] (uniquement pour les targets Electron et Web)
5. **Blacksmith** (`_blacksmith`) : Génération de rendus côté serveur via [goblin-blacksmith] si configuré
6. **Builds supplémentaires** (`_extraBuilds`) : Exécution de builders imbriqués configurés dans `app.json`
7. **Packaging final** : Création du package selon le format cible (electron-builder, node-deb, snapshot Blitz, etc.)

Le diagramme simplifié du flux pour un build Electron :

```
app.json → Builder (init)
  → _assets(dev=true) + _installDeps(dev=true)
  → _webpack()
  → _blacksmith() (si configuré)
  → _cleanup()
  → _extraBuilds()
  → _assets(dev=false) + _electron()
```

### Génération du numéro de version

Sur Windows, le numéro de build (`BUILD_NUMBER`) est automatiquement généré à partir de l'année et du numéro de semaine ISO courants, au format `YYWW` (ex. : `2508` pour la 8e semaine de 2025). Ce numéro est injecté dans la variable d'environnement `BUILD_NUMBER` lors du processus.

### Mode Blitz (WebContainer)

Le builder Blitz génère une application web capable d'exécuter une application Node.js complète dans le navigateur via l'API [WebContainer](https://webcontainer.io/). Le processus est :

1. Construction d'une application Node.js standard via `NodeBuilder`
2. Réorganisation du répertoire de release (déplacement de `lib/` vers `node_modules/`)
3. Création d'un snapshot msgpack de l'arborescence de fichiers
4. Découpage du snapshot en chunks de 4 Mo
5. Génération des fichiers HTML/JS à partir de templates, avec injection du nombre de chunks et du `clientId`

## Exemples d'utilisation

### Construction d'une application Electron

```javascript
// Construction simple avec les chemins du projet courant
await quest.cmd('electronify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});

// Construction en mode release (avec signature sur Windows)
await quest.cmd('electronify.build-release', {
  appId: 'my-app',
  output: '/path/to/output',
  arch: 'x64',
});

// Construction avec toutes les options
await quest.cmd('electronify.build-opts', {
  appId: 'my-app',
  variantId: 'pro',
  appDir: '/path/to/app',
  libDir: '/path/to/lib',
  output: '/path/to/output',
  release: true,
  arch: 'x64',
  compression: 'maximum',
});
```

### Construction d'un package Debian

```javascript
await quest.cmd('debify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

### Construction d'une application Node.js autonome

```javascript
await quest.cmd('nodify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

### Construction d'une application Blitz (WebContainer)

```javascript
await quest.cmd('blitzify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

### Construction d'un package NPX

```javascript
await quest.cmd('npxify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

### Construction d'une application web

```javascript
await quest.cmd('webify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

## Interactions avec d'autres modules

- **[goblin-webpack]** : Utilisé pour la compilation des sources JavaScript (bundles Electron et Web)
- **[goblin-blacksmith]** : Utilisé pour la génération de rendus côté serveur (SSR)
- **[xcraft-core-host]** : Point d'entrée des applications générées (`node_modules/xcraft-core-host/bin/host`)
- **[xcraft-core-fs]** : Opérations sur le système de fichiers (copie de modules, listing)
- **[xcraft-core-etc]** : Chargement des configurations d'application (`loadAppConfig`)
- **[xcraft-core-process]** : Exécution de processus externes (npm, esign, node-deb)
- **[xcraft-core-env]** : Gestion des variables d'environnement devroot (Windows)
- **[xcraft-core-utils]** : Utilitaires divers (`modules.extractConfigDeps`, `modules.loadAppConfig`, `whereIs`)

## Configuration avancée

Le module `goblin-builder` se configure principalement via le fichier `app.json` présent dans le répertoire d'application. Ce fichier est lu au démarrage de chaque constructeur.

| Option                | Description                                                     | Type               | Valeur par défaut |
| --------------------- | --------------------------------------------------------------- | ------------------ | ----------------- |
| `appId`               | Identifiant de l'application (doit être simple `/[a-z]+/`)      | `string`           | —                 |
| `name`                | Nom du package npm généré                                       | `string`           | —                 |
| `productName`         | Nom affiché du produit                                          | `string`           | `'Goblins'`       |
| `description`         | Description de l'application                                    | `string`           | —                 |
| `versionFrom`         | Module dont extraire la version (sinon : `bundle/package.json`) | `string`           | —                 |
| `appCompany`          | Identifiant société (simple, `/[a-z]+/`)                        | `string`           | —                 |
| `appCommit`           | Hash de commit fixe (sinon : `git rev-parse --short HEAD`)      | `string`           | —                 |
| `goblinEntryPoint`    | Point d'entrée goblin pour webpack Electron                     | `string`           | `'laboratory'`    |
| `useRealms`           | Active les realms dans le runtime                               | `boolean`          | —                 |
| `arch`                | Architecture cible globale ou par plateforme                    | `string\|object`   | `process.arch`    |
| `noAsar`              | Désactive l'archive ASAR pour Electron                          | `boolean`          | `false`           |
| `unpackedResources`   | Ressources à extraire de l'ASAR                                 | `string\|string[]` | —                 |
| `goblinResources`     | Dossiers de ressources de modules goblin à intégrer             | `string\|string[]` | —                 |
| `excludeResources`    | Ressources à exclure du package                                 | `string\|string[]` | —                 |
| `excludedGoblinFiles` | Fichiers du module goblin principal à exclure                   | `string\|string[]` | —                 |
| `excludedFiles`       | Fichiers généraux à exclure                                     | `string\|string[]` | —                 |
| `fileAssociations`    | Associations de types de fichiers (Electron)                    | `array`            | —                 |
| `protocols`           | Protocoles URL gérés par l'application                          | `array`            | —                 |
| `build`               | Options spécifiques electron-builder par plateforme             | `object`           | —                 |
| `debify`              | Options spécifiques à node-deb (dépendances Debian)             | `object`           | —                 |
| `debDeps`             | Dépendances Debian supplémentaires                              | `string[]`         | —                 |
| `extraBuilds`         | Builds supplémentaires imbriqués                                | `object`           | —                 |
| `blitzify`            | Options spécifiques pour le builder Blitz                       | `object`           | —                 |
| `blitzify.clientId`   | Client ID pour l'authentification WebContainer                  | `string`           | —                 |
| `appBin`              | Entrées binaires npm (`bin` dans package.json)                  | `object`           | —                 |

### Définition de l'application (`app.json`)

Les fichiers `app.json` sont situés dans le répertoire `app/<appId>/` du projet d'application. La section `xcraft` permet de passer des paramètres aux modules du framework, notamment à `xcraft-core-host` :

```json
{
  "appId": "myapp",
  "appCompany": "mycompany",
  "productName": "My Application",
  "xcraft": {
    "xcraft-core-host": {
      "mainQuest": "myapp.boot",
      "secondaryQuest": "myapp.start"
    }
  }
}
```

La `mainQuest` est exécutée avant l'état `ready` d'Electron (traitement des arguments CLI, configuration initiale). La `secondaryQuest` est appelée quand Electron est prêt, permettant l'utilisation de goblins comme `goblin-wm` pour créer des fenêtres.

### Variables d'environnement

| Variable        | Description                                                                         | Exemple                  | Valeur par défaut |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------ | ----------------- |
| `NODE_ENV`      | Environnement Node.js (forcé à `'production'` lors du build)                        | `'production'`           | —                 |
| `BUILD_NUMBER`  | Numéro de build au format `YYWW`, généré automatiquement sur Windows                | `'2508'`                 | —                 |
| `SIGNTOOL_PATH` | Chemin vers l'outil de signature `esign.exe` (Windows, sinon détecté via `whereIs`) | `'C:\\tools\\esign.exe'` | —                 |
| `APPLE_ID_TEAM` | ID d'équipe Apple pour la notarisation macOS via electron-builder                   | `'ABC123DEF'`            | —                 |

## Détails des sources

### `electronify.js`, `debify.js`, `nodify.js`, `webify.js`, `blitzify.js`, `npxify.js`

Ces six fichiers à la racine du module sont des points d'entrée Xcraft. Chacun exporte `xcraftCommands` qui charge `lib/service.js` en lui passant son propre nom (dérivé du nom de fichier) et le nom du backend correspondant. Ils n'implémentent aucune logique propre.

### `lib/service.js`

Factory générique qui enregistre trois quêtes Goblin pour chaque backend, puis crée le singleton via `Goblin.configure` et `Goblin.createSingle`.

#### Quêtes exposées

- **`build(quest, appId, output, $arch)`** — Construction avec les chemins standards du projet (`xcraft-core-host.projectPath`). Délègue à `build-opts`.
- **`build-release(quest, appId, output, $arch)`** — Identique à `build` mais passe `release: true` pour activer la signature des exécutables.
- **`build-opts(quest, appId, variantId, appDir, libDir, output, release, arch, compression, $targetRuntime, $targetVersion, $targetArch, $targetBuildFromSource, $targetBuildEnv)`** — Construction avec toutes les options personnalisables. Instancie le Builder correspondant et appelle `run()`. Les paramètres `$target*` permettent de cibler un runtime spécifique (ex. : Electron pour les natives addons).

La fonction `splitAppId` extrait le `variantId` depuis un `appId` de la forme `appId@variantId`.

### `lib/builder.js`

Classe de base abstraite dont héritent tous les constructeurs. Elle gère l'ensemble de l'initialisation : lecture de `app.json`, construction du `package.json` de release, extraction récursive des dépendances locales, génération de `goblins.json` et `config.js`, et fourniture des méthodes communes.

#### Méthodes publiques

- **`extractStartCraft(libDir, dep, isDev, deps={})`** — Extrait récursivement toutes les dépendances locales d'un module en parcourant ses `dependencies`, `optionalDependencies` et (si `isDev`) `devDependencies`. Retourne un objet `{dep: relativePath}`.
- **`_assets(isDev)`** — Copie les modules locaux dans `release/lib/`, met à jour `package.json` et `goblins.json`, copie `package-lock.json` et `.npmrc` si présents. En mode dev, ajoute le module goblin principal et ses dépendances.
- **`_installDeps(isDev)`** — Lance `npm install` dans le répertoire de release. En mode production ajoute `--omit=dev`. Supporte les options de cross-compilation via les variables `npm_config_*`.
- **`_blacksmith()`** — Exécute les rendus côté serveur configurés dans `goblin-blacksmith` du fichier de config de l'app.
- **`_extraBuilds()`** — Exécute les builds imbriqués définis dans `app.extraBuilds`, en appelant la commande `<builder>.build-opts` correspondante.
- **`_cleanup()`** — Supprime `lib/`, `node_modules/`, `package.json`, `package-lock.json`, `goblins.json` et `.npmrc` du répertoire de release (nettoyage entre les phases dev et prod).

### `lib/app-builder.js`

Constructeur spécialisé pour les applications Electron. Hérite de `Builder` et orchestre un processus en deux phases : d'abord un build de développement pour webpack, puis un build de production pour electron-builder.

La signature des exécutables Windows utilise `esign.exe` avec un mécanisme de retry (3 tentatives) et des timeouts SIGINT/SIGTERM/SIGKILL progressifs (2 min, 2 min 5 s, 2 min 10 s) pour gérer les processus bloqués.

La notarisation macOS est activée automatiquement si la variable `APPLE_ID_TEAM` est définie.

Les packages de sortie pour Linux sont renommés pour normaliser les noms (`name.zip` au lieu de `name-version.zip`).

#### Méthodes publiques

- **`_clean()`** — Supprime `productDir`, `resourcesDir` et `debugDir`, puis recrée `resourcesDir`.
- **`_webpack()`** — Lance `webpack.pack` avec le target `electron-renderer` et le point d'entrée configuré dans `app.goblinEntryPoint` (défaut : `'laboratory'`).
- **`_esignInit()`** — Initialise le chemin vers `esign.exe` via `SIGNTOOL_PATH` ou `whereIs`.
- **`_esign(configuration)`** — Signe le fichier `configuration.path` via esign avec retry automatique (3 tentatives max).
- **`_electron()`** — Configure et exécute electron-builder avec toutes les options (ASAR, ressources, associations de fichiers, protocoles, cibles par plateforme).
- **`run()`** — Orchestre le processus complet : clean → assets dev → installDeps dev → webpack → blacksmith → cleanup → extraBuilds → assets prod → electron.

### `lib/blitz-builder.js`

Constructeur spécialisé pour les applications Blitz. Il produit une application web autonome qui exécute une application Node.js complète dans le navigateur via l'API WebContainer.

#### Méthodes publiques

- **`cleanReleaseDir()`** — Déplace les modules du dossier `lib/` vers `node_modules/` et supprime `lib/` et `node_modules/.bin/`. Cette étape est nécessaire pour que le snapshot reflète une arborescence `node_modules` standard.
- **`generateBlitz(chunks, clientId)`** — Copie les templates depuis `lib/blitz/www/`, y substitue les placeholders (`{APP_PRODUCTNAME}`, `{APP_CHUNKS}`, `{APP_CLIENTID}`), lance `npm install` dans le répertoire www, puis copie le résultat dans `productDir`.
- **`splitSnapshot(snapshot, size)`** — Découpe le fichier snapshot en chunks de `size` octets (4 Mo par défaut) et retourne le nombre de chunks. Les fichiers sont nommés `snapshot.bin.0`, `snapshot.bin.1`, etc.
- **`run()`** — Orchestre le processus : NodeBuilder.run() → cleanReleaseDir() → snapshot() → splitSnapshot() → generateBlitz().

### `lib/deb-builder.js`

Constructeur spécialisé pour les packages Debian via `node-deb`. Il génère un service systemd et gère la configuration post-installation.

Le script `postinst` est enrichi dynamiquement pour créer le répertoire de données `/var/lib/<package>` et exécuter `npm rebuild` si `node_modules` est présent.

#### Méthodes publiques

- **`_copyResources(resourcesName)`** — Copie les ressources d'un dossier nommé vers le répertoire de release et enregistre les fichiers dans `_assetFiles`.
- **`_assetsDeb()`** — Prépare les assets Debian : génère `default_variables`, `postinst`, copie les ressources (par plateforme et variante).
- **`_npmInstall()`** — Lance `npm install --omit=dev` avec gestion temporaire du `.npmrc`.
- **`_nodeDeb()`** — Exécute `node-deb --install-strategy copy` pour créer le package `.deb`.
- **`_hasBlacksmith()`** — Vérifie si goblin-blacksmith est configuré pour cet app.
- **`run()`** — Orchestre le processus : (blacksmith optionnel) → cleanup → extraBuilds → assets prod → assetsDeb → npmInstall → nodeDeb.

### `lib/node-builder.js`

Constructeur spécialisé pour les applications Node.js autonomes. Similaire à `DebBuilder` mais sans génération de package Debian : produit un répertoire de release avec `node_modules` installés en production.

Supporte l'option `omit` pour exclure des types de dépendances supplémentaires (ex. : `['peer']` pour BlitzBuilder).

#### Méthodes publiques

- **`_copyResources(resourcesName)`** — Copie les ressources selon la plateforme et les variantes.
- **`_assetsDeb()`** — Prépare les assets (goblins.json, ressources).
- **`_npmInstall()`** — Lance `npm install` avec les options d'omission et de cross-compilation.
- **`_hasBlacksmith()`** — Vérifie si goblin-blacksmith est configuré.
- **`_clean()`** — Supprime `productDir`.
- **`run()`** — Orchestre le processus : clean → (blacksmith optionnel) → cleanup → extraBuilds → assets prod → assetsDeb → npmInstall.

### `lib/npx-builder.js`

Constructeur pour les packages NPX. À la différence des autres builders, il ne copie pas les sources locales ni n'installe `node_modules` : il génère uniquement un `package.json` référençant les versions exactes des dépendances (pour résolution depuis le registre npm) et les fichiers de ressources.

#### Méthodes publiques

- **`_copyResources(resourcesName)`** — Copie les ressources selon la plateforme et les variantes.
- **`_assets()`** — Génère `package.json` avec les versions exactes des dépendances et `goblins.json`.
- **`_assetsNpx()`** — Prépare les assets spécifiques NPX (ressources).
- **`_clean()`** — Supprime `productDir`.
- **`run()`** — Orchestre le processus : clean → cleanup → extraBuilds → assets → assetsNpx.

### `lib/web-builder.js`

Constructeur pour les applications web statiques. Produit un bundle webpack avec target `'web'` et `indexFile: 'index-browsers.js'`, sans phase de packaging finale. Destiné à être intégré dans d'autres systèmes de déploiement web.

#### Méthodes publiques

- **`_clean()`** — Supprime `productDir`, `resourcesDir` et `debugDir`, puis recrée `resourcesDir`.
- **`_webpack()`** — Lance `webpack.pack` avec target `'web'` et point d'entrée `'laboratory'`.
- **`run()`** — Orchestre le processus : clean → assets dev → installDeps dev → webpack.

### `lib/get-year-week-number.js`

Utilitaire de génération de numéros de build basés sur la norme ISO 8601.

- **`getYearWeekNumber(d)`** — Retourne `[year, weekNumber]` pour la date `d` selon la norme ISO 8601 (la semaine 1 est celle contenant le premier jeudi de l'année).
- **`yearWeekToBuildNumber(year, week)`** — Convertit `(2025, 8)` en `'2508'` (2 derniers chiffres de l'année + semaine sur 2 chiffres).

### `lib/blitz/snapshot.js`

Utilitaire de sérialisation de système de fichiers en format msgpack via `msgpackr`. Parcourt récursivement un répertoire en parallèle (avec un système de tâches asynchrones) et construit un arbre de données. Les fichiers sont inclus avec lecture différée (getter `c` qui lit le contenu au moment de la sérialisation). Les liens symboliques sont ignorés (avec avertissement). Les types non supportés (sockets, FIFO, périphériques) lèvent une erreur.

- **`snapshot(inputDir, outputFile)`** — Crée le snapshot msgpack du répertoire `inputDir` et l'écrit dans `outputFile`. Retourne une Promise.

### Fichiers spéciaux (Blitz WebContainer)

#### `lib/blitz/www/main.js`

Script client de l'application Blitz exécuté dans le navigateur. Il :

1. Initialise l'authentification WebContainer si un `clientId` est configuré
2. Démarre une instance WebContainer
3. Charge et reconstitue le snapshot depuis les chunks (`snapshot.bin.0`, `snapshot.bin.1`, ...)
4. Monte le snapshot dans WebContainer sous `/xcraft`
5. Lance l'hôte Xcraft via `node xcraft/node_modules/xcraft-core-host/bin/host`
6. Redirige l'affichage vers l'URL du serveur interne sur le port 9080 dans une iframe

#### `lib/blitz/www/package.json`

Dépendances npm pour l'environnement WebContainer (`@webcontainer/api ^1.5.0`) et un script `postinstall` qui corrige un bug d'import relatif dans l'API WebContainer (ajout de l'extension `.js` manquante dans `file-system.js`).

## Licence

Ce module est distribué sous [licence MIT](./LICENSE).

---

_Ce contenu a été généré par IA_

[goblin-webpack]: https://github.com/Xcraft-Inc/goblin-webpack
[goblin-blacksmith]: https://github.com/Xcraft-Inc/goblin-blacksmith
[xcraft-core-host]: https://github.com/Xcraft-Inc/xcraft-core-host
[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-etc]: https://github.com/Xcraft-Inc/xcraft-core-etc
[xcraft-core-process]: https://github.com/Xcraft-Inc/xcraft-core-process
[xcraft-core-env]: https://github.com/Xcraft-Inc/xcraft-core-env
[xcraft-core-utils]: https://github.com/Xcraft-Inc/xcraft-core-utils
