/* Fork-specific filter cases for com.local.premiumhome.homehelper. */
#include "filter.h"
#include <assert.h>
#include <stdio.h>
static int ev(struct filter*f,unsigned code,int value,uint64_t now){struct ev e={0,0,1,code,value};return filter_event(f,&e,now);}
int main(void){
 struct filter f={0};
 /* ARM32 kernel ABI: struct input_event is 16 bytes; LP64: 24. */
 if(sizeof(long)==4)assert(sizeof(struct ev)==16);else assert(sizeof(struct ev)==24);
 /* 1. Home -> launch: key-down asks for a launch, never forwarded (no PASS for any Home value). */
 assert(ev(&f,HELPER_HOME_CODE,1,1000)==OPEN_HOME);
 assert(ev(&f,HELPER_HOME_CODE,2,1100)==DROP);
 assert(ev(&f,HELPER_HOME_CODE,0,1200)==DROP);
 /* 2. Triple Home: three 40-500 ms taps inside 2 s -> 3 launch requests, RELEASE on the third key-up. */
 f=(struct filter){0};int opens=0,rel=0;
 for(int i=0;i<3;i++){uint64_t t=5000+i*300;int a=ev(&f,HELPER_HOME_CODE,1,t);opens+=a==OPEN_HOME;a=ev(&f,HELPER_HOME_CODE,0,t+120);rel+=a==RELEASE;assert(i<2?a==DROP:a==RELEASE);}
 assert(opens==3&&rel==1);
 /* boundaries: 40 ms and 500 ms taps count; 39 ms and 501 ms do not */
 f=(struct filter){0};for(int i=0;i<2;i++){ev(&f,HELPER_HOME_CODE,1,100+i*600);ev(&f,HELPER_HOME_CODE,0,140+i*600);}
 ev(&f,HELPER_HOME_CODE,1,1300);assert(ev(&f,HELPER_HOME_CODE,0,1800)==RELEASE);
 f=(struct filter){0};ev(&f,HELPER_HOME_CODE,1,100);ev(&f,HELPER_HOME_CODE,0,601);
 ev(&f,HELPER_HOME_CODE,1,700);ev(&f,HELPER_HOME_CODE,0,800);ev(&f,HELPER_HOME_CODE,1,900);assert(ev(&f,HELPER_HOME_CODE,0,1000)==DROP);
 /* taps spread over more than 2 s never release */
 f=(struct filter){0};for(int i=0;i<6;i++){ev(&f,HELPER_HOME_CODE,1,100+i*1100);assert(ev(&f,HELPER_HOME_CODE,0,200+i*1100)==DROP);}
 /* 3. Back passes through unchanged (down/repeat/up); long Back (>=1200 ms) asks for LG Home once. */
 f=(struct filter){0};
 assert(ev(&f,412,1,10000)==PASS);assert(ev(&f,412,2,10500)==PASS);
 assert(filter_timeout(&f,11199)==0);assert(filter_timeout(&f,11200)==OPEN_LG);assert(filter_timeout(&f,12000)==0);
 assert(ev(&f,412,0,12100)==PASS);
 /* short Back never opens LG Home */
 assert(ev(&f,412,1,13000)==PASS);assert(ev(&f,412,0,13300)==PASS);assert(filter_timeout(&f,20000)==0);
 /* Back between Home taps breaks a triple-Home sequence (any other key resets the count). */
 f=(struct filter){0};ev(&f,HELPER_HOME_CODE,1,100);ev(&f,HELPER_HOME_CODE,0,200);ev(&f,HELPER_HOME_CODE,1,400);ev(&f,HELPER_HOME_CODE,0,500);
 assert(ev(&f,412,1,600)==PASS);ev(&f,412,0,650);ev(&f,HELPER_HOME_CODE,1,700);assert(ev(&f,HELPER_HOME_CODE,0,800)==DROP);
 /* 4. Non-key events and common keys pass through. */
 unsigned keys[]={28,103,105,106,108,114,115,113,1,2,11,412};
 f=(struct filter){0};for(unsigned i=0;i<sizeof keys/sizeof keys[0];i++)for(int v=0;v<3;v++)assert(ev(&f,keys[i],v,30000)==PASS);
 struct ev rel_x={0,0,2,0,5},abs_x={0,0,3,0,100},syn={0,0,0,0,0},drop={0,0,0,3,0};
 assert(filter_event(&f,&rel_x,30000)==PASS);assert(filter_event(&f,&abs_x,30000)==PASS);assert(filter_event(&f,&syn,30000)==PASS);
 /* SYN_DROPPED (lost events) releases: fail-open */
 assert(filter_event(&f,&drop,30000)==RELEASE);
 printf("PASS: fork filter (home code %d): Home->launch never forwarded, triple-Home 3 requests+release, 40/500 ms bounds, 2 s window, Back passthrough + long-Back once, key reset, SYN_DROPPED release, sizeof(struct ev)=%zu\n",HELPER_HOME_CODE,sizeof(struct ev));
}
