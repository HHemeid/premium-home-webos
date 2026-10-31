#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include "lock.h"
#include "paths.h"
#include <string.h>
int main(int argc,char**argv){
 if(argc<3||strcmp(argv[2],"--controller")!=0){
  pid_t entry=fork();if(entry<0)return 1;if(entry>0)return 0;
  setsid();setenv("NODE_PATH","/usr/lib/nodejs:/usr/lib/node_modules",1);
  execl("/usr/bin/node","node",HELPER_APP_ROOT "/helper-entry.js",argc>1?argv[1]:"{}",(char*)0);_exit(2);
 }
 /* Owner revert switch (defence in depth; helper-entry also honours it): if the
  * disable latch is present, never arm the grab, on boot or tile tap. */
 if(access(HELPER_DISABLED,F_OK)==0)return 0;
 int lock=acquire_lock(HELPER_STATE "/controller.lock");if(lock<0)return 4;
 pid_t p=fork();if(p<0)return 1;
 if(p==0){
  setsid();setenv("NODE_PATH","/usr/lib/nodejs:/usr/lib/node_modules",1);
  int fd=open(HELPER_STATE "/bootstrap.log",O_WRONLY|O_APPEND|O_CREAT,0660);
  if(fd>=0)dprintf(fd,"BOOTSTRAP uid=%d pid=%d\n",getuid(),getpid());
  if(fd>=0){dup2(fd,0);dup2(fd,1);dup2(fd,2);if(fd>2)close(fd);}
  execl("/usr/bin/node","node",HELPER_APP_ROOT "/native.js",argc>1?argv[1]:"{}",(char*)0);_exit(2);
 }
 /* Parent: launch the independent fail-open guard (guard.c) as a detached sibling
  * of the controller. It must NOT keep controller.lock open -- a lingering guard
  * holding it would make a later restart see the lock busy (detach exit 4) -- so
  * the guard child closes its inherited copy before exec. The controller child
  * keeps its own copy, so the lock still persists for the controller's lifetime. */
 pid_t g=fork();
 if(g==0){close(lock);setsid();execl(HELPER_GUARD,HELPER_GUARD,(char*)0);_exit(2);}
 return 0;
}
