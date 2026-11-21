# magpie

```
  [Pica]  magpie  v1.0.0

          Remembers everything you copy.
          Press a key combo to paste
          something from earlier.
```

**magpie remembers everything you copy, so you can paste it again later.** Copied a link an hour
ago, then copied something else? Press **⌃⌥V** (control + option + V) in any app, type a word,
press Enter, and it's back on your clipboard.

Pica the magpie keeps the shiny things. Passwords are skipped, and nothing ever leaves your computer.

## Get it

With [pca](https://github.com/dpatel7-dev/Project-CLI-Access): open pca, pick **magpie**, press **I**. Or:

```sh
curl -fsSL https://djp7.pythonanywhere.com/magpie/install.sh | sh
```

Then start it once:

```sh
magpie on
```

That's it. From now on magpie keeps what you copy, also after you restart. It needs no
administrator and changes no settings on your Mac except its own key combo.

## Using it

| To | Do this |
| --- | --- |
| Paste something from earlier | **⌃⌥V** in any app (or ⌘Space, type *picker*, Enter). Type to find it, **Enter** copies it and takes you back. Then **⌘V**. |
| Pick one of the first nine | **⌘1** … **⌘9** in the picker |
| See everything | `magpie app` (or open **Magpie** from Spotlight): search, filters, pictures, pins |
| In Terminal | `magpie` shows the latest; type a number to copy it again. `magpie copy 3`, `magpie list homework` |
| Keep something forever | ★ in the window, ⌘P in the picker, or `magpie pin 3`. Give it a name: ⋯ › *Give it a name* |
| Change it as you copy it | ⋯ › *Copy it as*: a link without trackers, tidy spaces, UPPERCASE, one line, sorted lines, pretty JSON… or `magpie copy 2 --as url` |
| Copy several at once | click them in the window, then *Copy them together* |
| Send it to your phone | ⋯ › *Send to my other devices* (needs [pigeon](https://github.com/dpatel7-dev/pigeon)) |
| Stop for a while | *Pause for 30 min* in the window, or `magpie pause 1h` |
| Forget things | 🗑 in the window, `magpie forget 3`, or `magpie forget all` (pinned things stay) |

### The key combo

macOS lets an app add a key combo for every app without an administrator in one way: a
"service" (a little Automator workflow in `~/Library/Services`). `magpie on` makes one and gives it
**⌃⌥V**. Change it with `magpie key cmd+shift+v` or in the window's settings.

If it does nothing the first time, log out and back in once: macOS reads new key combos then. You
can also check it in **System Settings › Keyboard › Keyboard Shortcuts › Services › General ›
Magpie: pick something you copied**. And ⌘Space › *picker* always works.

## What's kept, and what isn't

- **Never read:** anything a password manager marks as secret (1Password, Bitwarden, Apple's
  Passwords and others mark what they copy), and anything copied in those apps.
- **Not kept:** things that look like a password, an API key, a sign-in token, a private key or a
  card number. You can see how many were skipped at the bottom of the window.
- **Kept:** the last 500 things (change it in settings), plus everything pinned. Repeats move to the
  top. Text over 200 KB is kept cut short.
- **Where:** `~/.magpie`, readable by you only. Pictures are PNG files in `~/.magpie/images`.

magpie's window is a page served only to this computer (127.0.0.1) at a secret address, so other
websites can't read your history.

## How it works

A small JavaScript-for-Automation program (macOS's own scripting, nothing to install) checks the
clipboard's change counter a few times a second, which costs next to nothing, and tells magpie what
was copied and from which app. The window opens in Chrome, Edge or Brave as an app window if you have
one; otherwise the picker uses macOS's own list. On Linux and Windows magpie checks the clipboard
every second while it's running (`magpie app`).

No dependencies: just Node.js 18+.

```sh
npm test
```

MIT licensed.
