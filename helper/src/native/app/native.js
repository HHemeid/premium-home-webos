'use strict';
// Controller for com.local.premiumhome.homehelper. Trimmed fork of upstream
// native/app/native.js (Razdva122/clean-your-tv-lg-webos @ b473fae, MIT).
// Kept: relay supervision, heartbeat/watchdog (fail-open), Home -> launch
// target, long-Back -> LG Home (optional), launch timeout, emergency-stop latch,
// once-per-boot activity registration.
// Removed: SSAP screen/power watch, resume/return-after-exit, file-based
// control (control.json, home-request.json, home-control.json), diagnostics,
// stall hooks, app inventory. ES5 only (no Object.assign/arrow/let) so it runs
// on Node 0.12+ without a Babel step.
var fs=require('fs'),cp=require('child_process'),policy=require('./runtime-policy'),config=require('./config');
function monotonic(){var t=process.hrtime();return t[0]*1000+t[1]/1e6;}
var root=config.root,data=config.state,installed=root+'/appinfo.json';
var launchParams;try{launchParams=JSON.parse(process.argv[2]||'{}');}catch(e){launchParams={};}
var automatic=!!launchParams&&launchParams.nativeHomeAuto===true;
function block(){try{fs.writeFileSync(data+'/blocked','stopped',{mode:420});}catch(ignore){}}
if(automatic&&fs.existsSync(data+'/blocked'))process.exit(0);
// Owner revert switch: a Mac-side disable latch stops the helper arming at all,
// on boot OR tile tap. Unlike 'blocked' it is NEVER cleared here (see below), only
// by uninstall or a redeploy that removes it.
if(fs.existsSync(config.disabled))process.exit(0);
var logPath=data+'/controller.log',pidPath=data+'/controller.pid',logged=0;
fs.writeFileSync(pidPath,String(process.pid));fs.writeFileSync(logPath,'');
function extend(a,b){for(var k in b)if(Object.prototype.hasOwnProperty.call(b,k))a[k]=b[k];return a;}
function log(x){
 try{
  var line=JSON.stringify(extend({time:Date.now()},x))+'\n';
  if(logged+line.length>config.logLimitBytes){fs.writeFileSync(logPath,'');logged=0;}
  fs.appendFileSync(logPath,line);logged+=line.length;
 }catch(e){try{console.error('Helper log failed: '+String(e));console.error(x);}catch(ignore){}}
}
var child=null;
process.on('uncaughtException',function(e){
 block();
 log({error:String(e),stack:e&&e.stack});
 setTimeout(function(){process.exit(2);},2500);
 try{if(child)child.stdin.end();}catch(ignore){}
});
var Service=require('/usr/lib/node_modules/webos-service');
var service=new Service(config.id);
service.activityManager.create('homehelper-controller',function(){});
// A manual (tile) start is the only way to clear the emergency-stop latch.
if(!automatic){try{fs.unlinkSync(data+'/blocked');}catch(e){if(e.code!=='ENOENT')throw e;}}
var ready=false,stopping=false,lastAck=monotonic(),buffer='',launching=false,visitingLG=false,lastHomeAt=null,removed=false;
log({event:'start',pid:process.pid,uid:process.getuid(),automatic:automatic,target:config.target});
function launch(id,params,done){
 var settled=false,payload={id:id};if(params)payload.params=params;
 var deadline=setTimeout(function(){if(settled)return;settled=true;log({event:'launch-timeout',id:id});done(false);},config.launchTimeoutMs);
 service.call('luna://com.webos.applicationManager/launch',payload,function(m){
  if(settled)return;settled=true;clearTimeout(deadline);
  var ok=!!(m&&m.payload&&m.payload.returnValue===true);
  log({event:'launch',id:id,params:params||null,ok:ok,result:m&&m.payload});done(ok);
 });
}
function visitLG(){
 if(visitingLG||stopping)return;
 visitingLG=true;var deadline=monotonic()+3500;
 function open(){
  if(launching&&!stopping&&monotonic()<deadline){setTimeout(open,50);return;}
  if(launching||stopping){visitingLG=false;return;}
  launching=true;
  launch(config.lgHome,null,function(){launching=false;visitingLG=false;});
 }
 open();
}
// No relaunch storms: one launch per burst of Home presses, none while a launch
// is in flight. A failed or timed-out Home launch stops the relay (fail-open).
function home(){
 var now=monotonic(),since=lastHomeAt===null?Infinity:now-lastHomeAt;lastHomeAt=now;
 if(stopping)return;
 if(launching||visitingLG){log({event:'home-suppressed',reason:'in-flight'});return;}
 if(since<config.homeBurstMs){log({event:'home-suppressed',reason:'burst',sinceMs:Math.round(since)});return;}
 launching=true;
 launch(config.target,null,function(ok){
  launching=false;
  if(!ok&&!stopping){log({event:'home-launch-failed-stopping'});try{child.stdin.end();}catch(ignore){}}
 });
}
function onLine(line){
 if(line==='P'){lastAck=monotonic();return;}
 log({event:'worker',message:line});
 if(line==='READY'){ready=true;lastAck=monotonic();return;}
 if(line==='LGHOME'){if(config.longBackOpensLGHome)visitLG();return;}
 if(line==='HOME')home();
}
function finish(code,signal){
 if(stopping)return;stopping=true;clearInterval(timer);
 log({event:'worker-exit',code:code,signal:signal});
 if(policy.shouldBlock(code,signal))block();
 var ended=false;
 function end(){if(ended)return;ended=true;try{fs.unlinkSync(pidPath);}catch(ignore){}process.exit(code||0);}
 // Release any key the relay left down on [1] (needed after SIGKILL).
 if(ready){
  var c;try{c=cp.spawn(root+'/relay',['cleanup'],{stdio:'ignore'});}catch(e){end();return;}
  c.on('error',function(e){log({event:'cleanup-error',error:String(e)});end();});
  c.on('exit',function(n){log({event:'cleanup',code:n});end();});
  setTimeout(end,3000);
 }else end();
}
// Liveness token for the independent guard (guard.c). The guard SIGKILLs the relay
// if this stops changing while the relay is alive -- the backstop for the case where
// both the controller and the relay are frozen, or the controller is killed and the
// relay frozen (nothing else can act). Written atomically (tmp+rename) so the guard
// never reads a torn line; the value just has to change each tick, so staleness is
// measured by the guard's own clock, not by comparing clocks across processes.
function beat(){try{if(!child)return;fs.writeFileSync(config.beat+'.tmp',child.pid+' '+Math.round(monotonic())+'\n');fs.renameSync(config.beat+'.tmp',config.beat);}catch(ignore){}}
function start(){
 lastAck=monotonic();
 child=cp.spawn(root+'/relay',[],{stdio:['pipe','pipe','pipe']});
 log({event:'worker-start',pid:child.pid});
 beat();
 child.stderr.on('data',function(b){log({stderr:String(b)});});
 child.on('error',function(e){log({error:String(e)});finish(1);});
 child.on('exit',finish);
 child.stdout.on('data',function(b){buffer+=b;var i;while((i=buffer.indexOf('\n'))>=0){var line=buffer.slice(0,i);buffer=buffer.slice(i+1);onLine(line);}});
 child.stdin.on('error',function(){});
}
function stopForRemoval(){
 if(removed)return;removed=true;log({event:'package-removed'});
 if(child&&!stopping){try{child.stdin.write('Q');}catch(ignore){}return;}
 stopping=true;process.exit(0);
}
var timer=setInterval(function(){
 if(stopping)return;
 // App removed (ares-install --remove, Dev Mode expiry, update): stop and release.
 if(!fs.existsSync(installed))stopForRemoval();
 if(child){
  beat();
  if(policy.expired(lastAck,monotonic())){log({event:'worker-watchdog'});child.kill('SIGKILL');return;}
  child.stdin.write('P');
 }
},config.heartbeatMs);
process.on('SIGTERM',function(){
 log({event:'sigterm'});
 if(stopping)return;
 if(!child){stopping=true;process.exit(0);return;}
 try{child.stdin.write('Q');}catch(ignore){}
 setTimeout(function(){try{child.kill('SIGKILL');}catch(ignore){}},2000);
});
// Boot and tile start: open Premium Home with {premiumHome:"start"} (never toggles
// Ambient). If the target cannot be launched, never grab the remote.
setTimeout(function(){
 if(stopping)return;
 launch(config.target,config.startParams,function(ok){
  if(stopping)return;
  if(ok)start();
  else{log({event:'target-launch-failed',id:config.target});block();try{fs.unlinkSync(pidPath);}catch(ignore){}process.exit(3);}
 });
},automatic?0:1000);
process.on('exit',function(code){log({event:'controller-exit',code:code});});
service.call('luna://'+config.service+'/status',{},function(m){
 log({event:'startup-status',result:m.payload});
 var p=m.payload;
 if(!p||!p.returnValue||(p.state&&p.state.enabled&&p.state.schema===3))return;
 service.call('luna://'+config.service+'/enable',{},function(a){
  if(!a.payload||!a.payload.returnValue){log({event:'startup-arm-error',result:a.payload});return;}
  service.call('luna://com.palm.activitymanager/create',{activity:{name:config.id+'.boot',description:'Premium Home Helper: start once per boot',type:{foreground:true,persist:true},schedule:{interval:'10s',precise:true},callback:{method:'luna://'+config.service+'/tick',params:{}}},start:true,replace:true,subscribe:false},function(r){log({event:'startup-create',result:r.payload});});
 });
});
