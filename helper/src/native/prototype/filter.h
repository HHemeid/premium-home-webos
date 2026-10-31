#include <stdint.h>
/* Fork: kernel input_event uses unsigned long for the timeval fields. That is
 * 16 bytes on ARM32 (identical to upstream's uint32_t layout) and 24 bytes on
 * LP64, so the same source also runs correctly in the arm64 uinput simulation. */
struct ev {unsigned long sec,usec;uint16_t type,code;int32_t value;};
/* LG remote Home key. Only the uinput simulation overrides it (stock kernels cap
 * key codes at KEY_MAX=767, so 773 cannot be emitted there); TV builds never do. */
#ifndef HELPER_HOME_CODE
#define HELPER_HOME_CODE 773
#endif
struct filter {int home,short_press,count,disabled,back,back_fired;uint64_t back_since;uint64_t since,last,taps[3];};
enum action {PASS,OPEN_HOME,DROP,RELEASE,OPEN_LG};
int filter_event(struct filter*,const struct ev*,uint64_t);
int filter_timeout(struct filter*,uint64_t);
