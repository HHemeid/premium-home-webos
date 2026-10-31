# Recovery

Premium Home is an ordinary Developer Mode app. Nothing here needs a factory reset, a firmware change or root.

| Situation | Do this |
|---|---|
| Want LG's Home | Press **Home** (without the helper). With the helper: **triple-press Home**, or hold **Back** 1–2 s, or Premium Home › ⚙ › LG Home |
| Premium Home misbehaves | `ares-install --device tv --remove local.lgc4.premiumhome`, or delete it in LG Home › Apps › Edit. Your settings are deleted with it; export them first (Settings › Backup & restore) |
| Remote doesn't respond (helper installed) | From your computer: `ares-install --device tv --remove com.local.premiumhome.homehelper`. Otherwise LG ThinQ or the power button → standby → on |
| Screen is black inside Premium Home | That's the 60-minute black screen; any key wakes it |
| Developer Mode expired | LG removed the developer apps. Re-enable Developer Mode, `ares-novacom --device tv --getkey`, reinstall |
| TV address changed | `ares-setup-device --modify tv -i "host=<new address>"` |

Never use a factory reset, a firmware downgrade, rooting or router changes as a recovery shortcut; none of them is needed.
