/* Fork: one place for the install path of com.local.premiumhome.homehelper.
 * webOS Developer Mode installs apps under /media/developer/apps/usr/palm/applications/<id>. */
#ifndef HELPER_APP_ROOT
#define HELPER_APP_ROOT "/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper"
#endif
#define HELPER_STATE HELPER_APP_ROOT "/state"
/* Fork: the independent fail-open guard reads the controller's liveness token from
 * HELPER_BEAT and the owner revert switch is HELPER_DISABLED (see guard.c, native.js). */
#define HELPER_RELAY HELPER_APP_ROOT "/relay"
#define HELPER_GUARD HELPER_APP_ROOT "/guard"
#define HELPER_BEAT HELPER_STATE "/relay.beat"
#define HELPER_DISABLED HELPER_STATE "/disabled"
