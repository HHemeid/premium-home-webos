'use strict';
// Boot service for com.local.premiumhome.homehelper. Trimmed fork of upstream
// native/service/service.js (b473fae, MIT): no /tmp debug files, no app
// inventory (SSAP), no state-permissions repair (package ownership is set at
// packaging time, as upstream's fix-package-data.py does). ES5 only.
var fs=require('fs'),Service=require('webos-service'),bootState=require('./boot-state');
var APP='com.local.premiumhome.homehelper';
var APP_ROOT='/media/developer/apps/usr/palm/applications/'+APP,APP_STATE=APP_ROOT+'/state';
var service=new Service(APP+'.service');
var statePath=__dirname+'/state/startup-state.json',name=APP+'.boot';
function read(){try{return JSON.parse(fs.readFileSync(statePath,'utf8'));}catch(e){return {enabled:false};}}
function save(state){fs.writeFileSync(statePath+'.tmp',JSON.stringify(state));fs.renameSync(statePath+'.tmp',statePath);}
function boot(){return bootState.identity(fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),fs.readFileSync('/proc/stat','utf8'));}
function call(uri,args,cb){service.call(uri,args,function(m){cb(m.payload);});}
function complete(message,result){
 if(message.payload.$activity&&message.activity)service.activityManager.complete(message.activity,{restart:true},function(){message.respond({returnValue:true,result:result});});
 else message.respond({returnValue:true,result:result});
}
function blocked(){try{fs.statSync(APP_STATE+'/blocked');return true;}catch(e){return e.code!=='ENOENT';}}
// Owner revert switch (Mac-side disable latch): the boot tick never launches the
// helper while it exists. Unlike 'blocked' it is not cleared by a tile tap.
function disabled(){try{fs.statSync(APP_STATE+'/disabled');return true;}catch(e){return e.code!=='ENOENT';}}
// Check the controller identity as well as its PID; stale state is not running.
function running(){try{var pid=fs.readFileSync(APP_STATE+'/controller.pid','utf8').trim();if(!/^[1-9][0-9]*$/.test(pid))return false;var args=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0');return args.indexOf(APP_ROOT+'/native.js')>=0;}catch(_){return false;}}
service.register('status',function(m){try{m.respond({returnValue:true,state:read(),boot:boot(),blocked:blocked(),disabled:disabled(),running:running()});}catch(e){m.respond({returnValue:false,errorText:String(e)});}});
service.register('disable',function(m){try{save({enabled:false});call('luna://com.palm.activitymanager/cancel',{activityName:name},function(r){m.respond({returnValue:true,cancel:r});});}catch(e){m.respond({returnValue:false,errorText:String(e)});}});
service.register('enable',function(m){try{save({enabled:true,boot:boot(),schema:3});m.respond({returnValue:true});}catch(e){m.respond({returnValue:false,errorText:String(e)});}});
service.register('tick',function(m){try{
 if(disabled()){complete(m,{disabled:true});return;}
 if(blocked()){complete(m,{blocked:true});return;}
 var next=bootState.claim(read(),boot(),blocked());if(!next){complete(m,{skipped:true});return;}
 // Persist before launching: a crash or watchdog exit must never create a restart loop.
 next.schema=3;next.claimedAt=Date.now();save(next);
 call('luna://com.webos.applicationManager/launch',{id:APP,params:{nativeHomeAuto:true}},function(r){next.launch=r;save(next);complete(m,r);});
}catch(e){complete(m,{returnValue:false,errorText:String(e)});}});
