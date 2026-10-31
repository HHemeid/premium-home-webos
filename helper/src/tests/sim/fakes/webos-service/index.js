'use strict';
// SIMULATION ONLY. Stand-in for the TV's /usr/lib/node_modules/webos-service:
// every Luna call is forwarded to /usr/local/bin/fake-luna, which records it.
var cp=require('child_process');
function Service(name){this.name=name;this.activityManager={create:function(n,cb){if(cb)cb({});},complete:function(a,o,cb){if(cb)cb({});}};}
Service.prototype.register=function(){};
Service.prototype.call=function(uri,args,cb){
 cp.execFile('/usr/local/bin/fake-luna',[uri,JSON.stringify(args)],{timeout:60000},function(err,stdout){
  var payload;try{payload=JSON.parse(stdout);}catch(e){payload={returnValue:false,errorText:'fake-luna: '+String(err)};}
  cb({payload:payload});
 });
};
module.exports=Service;
