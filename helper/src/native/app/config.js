'use strict';
// Fork: every id, path and tunable of com.local.premiumhome.homehelper in one file (ES5).
var root='/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper';
module.exports={
 id:'com.local.premiumhome.homehelper',
 service:'com.local.premiumhome.homehelper.service',
 root:root,
 state:root+'/state',
 // Independent fail-open guard: the controller writes a changing liveness token
 // here every heartbeat; guard.c (a separate process) SIGKILLs the relay if it stops.
 beat:root+'/state/relay.beat',
 // Owner revert switch (Mac-side, no remote, no network listener): if this file
 // exists the helper never arms the grab, on boot or tile tap. Cleared only by
 // uninstall or a redeploy that removes it (NOT by a tile tap, unlike 'blocked').
 disabled:root+'/state/disabled',
 target:'local.lgc4.premiumhome',
 // Boot and tile launches; Premium Home never toggles Ambient for these params.
 startParams:{premiumHome:'start'},
 lgHome:'com.webos.app.home',
 // Optional escape: hold Back >= 1.2 s opens LG Home once (relay emits LGHOME).
 longBackOpensLGHome:true,
 // Home presses closer together than this are one press (matches Premium Home's
 // 0.8 s relaunch-burst rule); also suppressed while a launch is in flight.
 homeBurstMs:800,
 launchTimeoutMs:3000,
 heartbeatMs:400,
 logLimitBytes:262144
};
