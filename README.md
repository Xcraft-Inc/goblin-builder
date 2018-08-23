# Goblin Builder

## Electron

This goblin provides a versatil and easy way in order to produce releases for
all usual platforms. A release is based on an "application". It means that with
Westeros you can build more than one application just by providing the right
definition to the `electronify.build` command.

## Application's definitions

The definitions are located in the `app/` directory of Westeros. The directory's
name should matchs the name provided in the `app.json` file.

The `appCompany` and `appId` entries should be as simple as possible (only
`/[a-z]+/`) because it's used for creating the settings directories in the
`$HOME` (OS user).

The `xcraft` section is very useful for providing settings to the `xcraft`
modules, especially `xcraft-core-host`. This module is used for bootstrapping
the first application.

Here an example:

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

The `mainQuest` is executed before the `ready` state of Electron. It should be
used for handling special parameters (on command line) for example and all
other stuffs which are not depending of Electron.

The `secondaryQuest` is called when Electron is ready. Then it's possible to use
goblins like `goblin-wm` in order to create windows.

The values pass to the quests are commands without arguments.

## Building

To build a release, you have to send the `electronify.build` command with the
application's name (diectory's name in `app/`) and the absolute output path.
Note that cross-building is not supported. The output is always using the same
platform that the one used by Westeros.

In some cases it's possible to build Windows releases on Linux host but it's an
exception and it's not handled here.
