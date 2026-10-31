/*
 * VPN status, honest by construction. Premium Home cannot create a VPN: a webOS app has no
 * system-level VPN or routing API, and SmartDNS is not encryption. TV-wide VPN needs a router or
 * gateway running the NordVPN connection (see VPN-GATEWAY-DESIGN.md).
 *
 * The adapter slot stays empty until a specific router/gateway with a safe, authenticated local
 * status API has been identified and the owner approves pairing. With no adapter the state is
 * always 'not-configured', and the UI shows no on/off switch. Credentials never live in this app.
 */
(function (PH) {
  'use strict';

  var STATES = {
    'not-configured': 'Not configured',
    unknown: 'Status unknown',
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Error'
  };

  // A future adapter must implement: status() → Promise<{ state, server?, checkedAt }> where state is
  // one of STATES and 'connected' is reported only after the gateway itself confirms the tunnel.
  var adapter = null;

  function status() {
    if (!adapter) return { state: 'not-configured', label: STATES['not-configured'], canControl: false };
    return { state: 'unknown', label: STATES.unknown, canControl: false };
  }

  PH.vpn = { STATES: STATES, status: status, hasAdapter: function () { return !!adapter; } };
})(window.PH = window.PH || {});
