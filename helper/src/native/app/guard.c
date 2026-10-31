/* Fork: independent fail-open guard for com.local.premiumhome.homehelper.
 *
 * Why it exists. The relay holds EVIOCGRAB on the physical remote ([0]). Two
 * watchdogs normally drop that grab: the relay exits 2 s after the controller
 * stops heart-beating, and the controller SIGKILLs the relay 2.5 s after the
 * relay stops acking. Both need one of those two processes to still be running.
 * If BOTH are frozen (SIGSTOP), or the relay is frozen and the controller is
 * killed, nothing is left to act and the remote stays grabbed (sim s11/s12).
 *
 * This guard is a third, independent process (spawned by detach, a sibling of
 * the controller and the relay). It never opens an input device and never grabs
 * anything. It watches a liveness token the controller rewrites every heartbeat
 * in HELPER_BEAT. If that token stops changing for > STALL_MS while the relay is
 * still alive, the controller can no longer protect the remote, so the guard
 * SIGKILLs the relay. SIGKILL is delivered even to a SIGSTOPped task, and the
 * kernel then tears down its fds, dropping the grab.
 *
 * Design rules it keeps:
 *  - Minimal: ~one file read + one kill(pid,0) every POLL_MS; no threads, no deps.
 *  - Never grabs input: it opens no /dev/input node at all.
 *  - Exits when the relay is gone (job done) or the package is removed.
 *  - No relaunch storms: it only ever sends ONE SIGKILL, then exits. It launches
 *    nothing.
 *  - Clock-agnostic: staleness is measured by how long the token has been
 *    UNCHANGED, using only the guard's own CLOCK_MONOTONIC. It never compares the
 *    controller's clock to its own, so there is no cross-process clock assumption.
 *  - Kills only our own relay: before the one SIGKILL it confirms the pid's
 *    /proc/<pid>/exe (or, as a fallback, /proc/<pid>/comm) is the relay. If it can
 *    confirm neither it does not kill (a reused pid can only occur once the relay
 *    has already exited, i.e. once the grab is already gone, so not killing then
 *    loses nothing). */
#define _GNU_SOURCE
#include "paths.h"
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
#include <stdint.h>
#include <sys/stat.h>

#define POLL_MS   200
#define STALL_MS  2500    /* token unchanged this long while relay alive -> kill */
#define GRACE_MS  15000   /* give the controller this long to produce a first beat */

static uint64_t ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}

/* Read HELPER_BEAT ("<pid> <token>\n"). Returns 1 and fills pid/token on a clean
 * parse, 0 otherwise (missing, empty, or a torn write). Never blocks. */
static int read_beat(long*pid,char*token,size_t tn){
 int fd=open(HELPER_BEAT,O_RDONLY|O_CLOEXEC);if(fd<0)return 0;
 char buf[128];ssize_t n=read(fd,buf,sizeof buf-1);close(fd);
 if(n<=0)return 0;
 buf[n]='\0';
 /* require a trailing newline so a half-written file is treated as "not ready" */
 if(!memchr(buf,'\n',(size_t)n))return 0;
 long p;int off=0;if(sscanf(buf,"%ld %n",&p,&off)<1||p<=0||off<=0)return 0;
 char*t=buf+off,*nl=strchr(t,'\n');if(nl)*nl='\0';
 if(!*t)return 0;
 *pid=p;strncpy(token,t,tn-1);token[tn-1]='\0';return 1;
}

static int alive(long pid){return kill((pid_t)pid,0)==0||errno==EPERM;}

static int exists(const char*path){struct stat st;return stat(path,&st)==0;}

/* True if /proc/<pid> identifies this pid as our relay binary. */
static int is_our_relay(long pid){
 char path[64],buf[512];ssize_t n;
 snprintf(path,sizeof path,"/proc/%ld/exe",pid);
 n=readlink(path,buf,sizeof buf-1);
 if(n>0){buf[n]=0;if(!strcmp(buf,HELPER_RELAY))return 1;}
 snprintf(path,sizeof path,"/proc/%ld/comm",pid);
 int fd=open(path,O_RDONLY|O_CLOEXEC);
 if(fd>=0){n=read(fd,buf,sizeof buf-1);close(fd);if(n>0){buf[n]=0;char*nl=strchr(buf,'\n');if(nl)*nl=0;if(!strcmp(buf,"relay"))return 1;}}
 return 0;
}

int main(void){
 signal(SIGPIPE,SIG_IGN);
 uint64_t start=ms(),last_change=0;
 char seen[128]={0},token[128];long pid=0,beat_pid=0;int armed=0;
 for(;;){
  if(!exists(HELPER_APP_ROOT "/appinfo.json"))return 0; /* package removed */
  if(read_beat(&beat_pid,token,sizeof token)){
   if(!armed){
    /* Arm only on a beat whose pid is actually alive, so a stale leftover beat
     * from a previous session (dead pid) never arms us on the wrong process. */
    if(alive(beat_pid)){armed=1;pid=beat_pid;strcpy(seen,token);last_change=ms();}
   }else{
    if(beat_pid!=pid||strcmp(seen,token)){pid=beat_pid;strcpy(seen,token);last_change=ms();}
    if(!alive(pid))return 0; /* our relay is gone: nothing to guard */
    if(ms()-last_change>STALL_MS){
     if(is_our_relay(pid))kill((pid_t)pid,SIGKILL);
     return 0; /* one shot, then done either way */
    }
   }
  }else if(armed){
   return 0; /* beat vanished mid-session; relay is being torn down */
  }else if(ms()-start>GRACE_MS){
   return 0; /* controller never produced a beat (e.g. target launch failed) */
  }
  usleep(POLL_MS*1000);
 }
}
