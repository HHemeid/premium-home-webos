'use strict';
// Fork (com.local.premiumhome.homehelper): ES5 only, runs unchanged on Node 0.12+.
// SAM runs `detach <params>`, which execs this file.
//  - {nativeHomeAuto:true}  : boot activity tick. Starts the controller; the
//    controller honours the emergency-stop latch (state/blocked).
//  - anything else (tile tap): explicit manual start. Starts the controller
//    (which clears the latch and opens Premium Home with {premiumHome:"start"}).
//    If the controller is already running (detach exit 4 = lock busy), only
//    open Premium Home, again with {premiumHome:"start"} so it never toggles Ambient.
// Upstream's {showHelper:true} relaunch of the target app is removed: a plain
// relaunch would toggle Premium Home's Ambient view.
var config=require('./config');
var fs=require('fs');
var params;try{params=JSON.parse(process.argv[2]||'{}');}catch(_){params={};}
if(!params||typeof params!=='object')params={};
var cp=require('child_process');
var automatic=params.nativeHomeAuto===true;
// Owner revert switch: if the Mac-side disable latch is present the helper never
// arms. A boot tick does nothing; a tile tap still opens Premium Home (so the icon
// is not dead) but never starts the controller. Only uninstall or a redeploy that
// removes the latch re-enables it -- a tile tap does NOT clear it.
if(fs.existsSync(config.disabled)){
 if(automatic)process.exit(0);
 else cp.execFile('/usr/bin/luna-send-pub',['-n','1','luna://com.webos.applicationManager/launch',JSON.stringify({id:config.target,params:config.startParams})],{timeout:5000},function(error){process.exit(error?1:0);});
}else{
var child=cp.spawn(config.root+'/detach',[JSON.stringify({nativeHomeAuto:automatic}),'--controller'],{detached:true,stdio:'ignore'});
child.on('error',function(){process.exit(1);});
if(automatic){child.unref();}
else child.on('exit',function(code){
 if(code!==4){process.exit(code===0?0:1);return;}
 cp.execFile('/usr/bin/luna-send-pub',['-n','1','luna://com.webos.applicationManager/launch',JSON.stringify({id:config.target,params:config.startParams})],{timeout:5000},function(error){process.exit(error?1:0);});
});
}
