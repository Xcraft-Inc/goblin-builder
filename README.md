# 📘 Documentation du module goblin-builder

## Aperçu

Le module `goblin-builder` est un outil de construction et de packaging polyvalent pour les applications Xcraft. Il permet de générer différents types de packages pour diverses plateformes (Windows, Linux, macOS) et formats (Electron, Debian, Node.js, Web, Blitz). Ce module transforme une application Xcraft en un produit déployable en gérant les dépendances, les ressources et les configurations spécifiques à chaque plateforme.

## Structure du module

Le module est organisé autour de plusieurs constructeurs spécialisés, chacun exposé via une commande Xcraft :

- **electronify.js** (`app-builder`) : Crée des applications Electron pour Windows, Linux et macOS
- **debify.js** (`deb-builder`) : Génère des packages Debian pour Linux
- **nodify.js** (`node-builder`) : Crée des applications Node.js autonomes
- **webify.js** (`web-builder`) : Construit des applications web
- **blitzify.js** (`blitz-builder`) : Crée des applications web exécutables dans un conteneur WebAssembly

Tous ces constructeurs héritent d'une classe de base `Builder` qui fournit les fonctionnalités communes.

## Fonctionnement global

Le processus de construction suit généralement ces étapes :

1. **Initialisation** : Analyse du fichier `app.json` et des dépendances
2. **Préparation des assets** : Copie des ressources et des fichiers nécessaires
3. **Webpack** : Compilation des sources JavaScript (si nécessaire)
4. **Installation des dépendances** : Via npm
5. **Blacksmith** : Génération de rendus côté serveur (si configuré)
6. **Packaging** : Création du package final selon le format cible

Chaque constructeur spécialise ce flux de travail pour son format cible spécifique.

## Exemples d'utilisation

### Construction d'une application Electron

```javascript
// Via la ligne de commande Xcraft
await quest.cmd('electronify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});

// Avec des options avancées
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

### Construction d'une application Node.js

```javascript
await quest.cmd('nodify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

### Construction d'une application Blitz

```javascript
await quest.cmd('blitzify.build', {
  appId: 'my-app',
  output: '/path/to/output',
});
```

## Interactions avec d'autres modules

- **[goblin-webpack]** : Utilisé pour la compilation des sources JavaScript
- **[goblin-blacksmith]** : Utilisé pour la génération de rendus côté serveur
- **[xcraft-core-host]** : Utilisé comme point d'entrée pour les applications générées
- **[xcraft-core-fs]** : Utilisé pour les opérations sur le système de fichiers
- **[xcraft-core-etc]** : Utilisé pour charger les configurations
- **[xcraft-core-process]** : Utilisé pour exécuter des processus externes

## Configuration avancée

Le module `goblin-builder` peut être configuré via le fichier `app.json` de l'application :

| Option            | Description                                     | Type         | Valeur par défaut |
| ----------------- | ----------------------------------------------- | ------------ | ----------------- |
| appId             | Identifiant de l'application                    | String       | -                 |
| productName       | Nom du produit                                  | String       | 'Goblins'         |
| description       | Description de l'application                    | String       | -                 |
| versionFrom       | Module à partir duquel extraire la version      | String       | -                 |
| goblinEntryPoint  | Point d'entrée goblin                           | String       | 'laboratory'      |
| mainGoblinModule  | Module goblin principal                         | String       | -                 |
| fileAssociations  | Associations de fichiers pour l'application     | Array        | -                 |
| protocols         | Protocoles URL gérés par l'application          | Array        | -                 |
| build             | Options spécifiques à electron-builder          | Object       | -                 |
| debify            | Options spécifiques à node-deb                  | Object       | -                 |
| excludeResources  | Ressources à exclure du package                 | Array/String | -                 |
| unpackedResources | Ressources à ne pas inclure dans l'archive ASAR | Array/String | -                 |
| extraBuilds       | Builds supplémentaires à effectuer              | Object       | -                 |
| blitzify          | Options spécifiques pour le builder Blitz       | Object       | -                 |

### Variables d'environnement

| Variable      | Description                                          | Exemple                        | Valeur par défaut |
| ------------- | ---------------------------------------------------- | ------------------------------ | ----------------- |
| NODE_ENV      | Environnement Node.js                                | 'production'                   | -                 |
| BUILD_NUMBER  | Numéro de build (généré automatiquement sur Windows) | '2308'                         | -                 |
| SIGNTOOL_PATH | Chemin vers l'outil de signature (Windows)           | 'C:\\Program Files\\esign.exe' | -                 |
| APPLE_ID_TEAM | ID d'équipe Apple pour la notarisation (macOS)       | 'ABC123DEF'                    | -                 |

## Détails des sources

### `builder.js`

Classe de base pour tous les constructeurs. Elle fournit les fonctionnalités communes :

- Analyse du fichier `app.json`
- Extraction des dépendances
- Préparation des assets
- Installation des dépendances
- Nettoyage des fichiers temporaires

#### Méthodes publiques

- **`extractStartCraft(libDir, dep, isDev, deps)`** - Extrait récursivement les dépendances d'un module pour la construction.
- **`_assets(isDev, next)`** - Prépare les assets pour la construction, en mode développement ou production.
- **`_installDeps(isDev, next)`** - Installe les dépendances npm, en mode développement ou production.
- **`_blacksmith()`** - Exécute les tâches de rendu côté serveur via goblin-blacksmith.
- **`_extraBuilds()`** - Exécute des builds supplémentaires configurés dans app.json.
- **`_cleanup()`** - Nettoie les fichiers temporaires après la construction.

### `app-builder.js`

Constructeur spécialisé pour les applications Electron. Il gère :

- La configuration d'electron-builder
- La signature des exécutables (Windows)
- La génération de packages pour Windows, Linux et macOS
- La gestion des associations de fichiers

#### Méthodes publiques

- **`_clean(next)`** - Nettoie les répertoires de construction.
- **`_webpack()`** - Compile les sources JavaScript avec webpack.
- **`_esignInit()`** - Initialise l'outil de signature pour Windows.
- **`_esign(configuration)`** - Signe un fichier exécutable sur Windows.
- **`_electron()`** - Exécute electron-builder pour créer les packages.
- **`run()`** - Point d'entrée principal qui orchestre tout le processus de construction.

### `deb-builder.js`

Constructeur spécialisé pour les packages Debian. Il gère :

- La configuration de node-deb
- La génération de scripts post-installation
- La gestion des dépendances Debian

#### Méthodes publiques

- **`_copyResources(resourcesName)`** - Copie les ressources spécifiques.
- **`_assetsDeb()`** - Prépare les assets spécifiques pour les packages Debian.
- **`_npmInstall(next)`** - Installe les dépendances npm pour le package Debian.
- **`_nodeDeb(next)`** - Exécute node-deb pour créer le package Debian.
- **`_hasBlacksmith()`** - Vérifie si le module utilise goblin-blacksmith.
- **`run()`** - Point d'entrée principal qui orchestre tout le processus de construction.

### `node-builder.js`

Constructeur spécialisé pour les applications Node.js autonomes. Il gère :

- La création d'une structure de projet Node.js
- L'installation des dépendances de production uniquement
- La copie des ressources nécessaires

#### Méthodes publiques

- **`_copyResources(resourcesName)`** - Copie les ressources spécifiques.
- **`_assetsDeb()`** - Prépare les assets spécifiques.
- **`_npmInstall(next)`** - Installe les dépendances npm.
- **`_hasBlacksmith()`** - Vérifie si le module utilise goblin-blacksmith.
- **`_clean()`** - Nettoie les répertoires de construction.
- **`run()`** - Point d'entrée principal qui orchestre tout le processus de construction.

### `web-builder.js`

Constructeur spécialisé pour les applications web. Il gère :

- La configuration de webpack pour le web
- La génération des fichiers statiques

#### Méthodes publiques

- **`_clean(next)`** - Nettoie les répertoires de construction.
- **`_webpack()`** - Compile les sources JavaScript avec webpack pour le web.
- **`run()`** - Point d'entrée principal qui orchestre tout le processus de construction.

### `blitz-builder.js`

Constructeur spécialisé pour les applications Blitz (WebAssembly). Il gère :

- La création d'un snapshot de l'application Node.js
- La génération des fichiers HTML/JS nécessaires pour le conteneur WebContainer
- Le découpage du snapshot en chunks pour optimiser le chargement
- L'intégration avec l'API WebContainer pour exécuter l'application dans le navigateur

#### Méthodes publiques

- **`cleanReleaseDir()`** - Nettoie et réorganise le répertoire de release.
- **`generateBlitz(chunks, clientId)`** - Génère les fichiers nécessaires pour l'application Blitz.
- **`splitSnapshot(snapshot, size)`** - Divise le snapshot en chunks de taille spécifiée.
- **`run()`** - Point d'entrée principal qui orchestre tout le processus de construction.

### `service.js`

Définit les commandes Xcraft exposées par le module :

- **`build(quest, appId, output, $arch)`** - Construction avec les paramètres par défaut.
- **`build-release(quest, appId, output, $arch)`** - Construction en mode release.
- **`build-opts(quest, appId, variantId, appDir, libDir, output, release, arch, compression, $targetRuntime, $targetVersion, $targetArch)`** - Construction avec des options personnalisées.

### `get-year-week-number.js`

Utilitaire pour générer des numéros de build basés sur l'année et la semaine, utilisé principalement pour les versions Windows.

- **`getYearWeekNumber(d)`** - Obtient le numéro de semaine ISO et l'année correspondante pour une date donnée.
- **`yearWeekToBuildNumber(year, week)`** - Convertit une année et un numéro de semaine en numéro de build.

### `blitz/snapshot.js`

Utilitaire pour créer un snapshot d'une application Node.js, utilisé par le constructeur Blitz. Il parcourt récursivement le système de fichiers et sérialise la structure en utilisant msgpackr.

- **`snapshot(inputDir, outputFile)`** - Crée un snapshot du répertoire d'entrée et l'écrit dans le fichier de sortie.

### `eslint.config.js`

Configuration ESLint pour le projet, utilisant le nouveau format de configuration plat d'ESLint. Il configure les règles pour JavaScript et React.

## Définitions d'applications

Les définitions d'applications sont situées dans le répertoire `app/` du projet d'application. Le nom du répertoire doit correspondre au nom fourni dans le fichier `app.json`.

Les entrées `appCompany` et `appId` doivent être aussi simples que possible (uniquement `/[a-z]+/`) car elles sont utilisées pour créer les répertoires de configuration dans le `$HOME` (utilisateur OS).

La section `xcraft` est très utile pour fournir des paramètres aux modules `xcraft`, en particulier `xcraft-core-host`. Ce module est utilisé pour démarrer la première application.

Exemple :

```json
{
  "xcraft": {
    "xcraft-core-host": {
      "mainQuest": "myapp.boot",
      "secondaryQuest": "myapp.start"
    }
  }
}
```

La `mainQuest` est exécutée avant l'état `ready` d'Electron. Elle doit être utilisée pour gérer des paramètres spéciaux (en ligne de commande) par exemple et toutes les autres choses qui ne dépendent pas d'Electron.

La `secondaryQuest` est appelée lorsqu'Electron est prêt. Il est alors possible d'utiliser des goblins comme `goblin-wm` pour créer des fenêtres.

_Cette documentation a été mise à jour._

[goblin-webpack]: https://github.com/Xcraft-Inc/goblin-webpack
[goblin-blacksmith]: https://github.com/Xcraft-Inc/goblin-blacksmith
[xcraft-core-host]: https://github.com/Xcraft-Inc/xcraft-core-host
[xcraft-core-fs]: https://github.com/Xcraft-Inc/xcraft-core-fs
[xcraft-core-etc]: https://github.com/Xcraft-Inc/xcraft-core-etc
[xcraft-core-process]: https://github.com/Xcraft-Inc/xcraft-core-process